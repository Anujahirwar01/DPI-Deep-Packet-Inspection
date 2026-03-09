/**
 * Generates a test PCAP file with mixed traffic:
 *   - Normal HTTP (example.com)
 *   - Normal HTTPS / GOOGLE
 *   - YOUTUBE (TLS SNI) – blocked by app rule
 *   - FACEBOOK (TLS SNI) – blocked by app rule
 *   - TIKTOK (TLS SNI)   – blocked by app rule
 *   - Traffic FROM 10.0.0.66 – blocked by IP rule
 *   - Traffic on port 6881 (torrent) – blocked by port rule
 *   - DNS queries (UDP 53)
 */

const fs = require('fs');
const path = require('path');

// ── Helpers ───────────────────────────────────────────────────────────────

function ip2buf(ipStr) {
    return Buffer.from(ipStr.split('.').map(Number));
}

function mac2buf(macStr) {
    return Buffer.from(macStr.split(':').map(b => parseInt(b, 16)));
}

function ipChecksum(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i += 2) {
        sum += buf.readUInt16BE(i);
    }
    while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
    return (~sum) & 0xffff;
}

// ── Ethernet frame builder ─────────────────────────────────────────────────

const SRC_MAC = mac2buf('aa:bb:cc:dd:ee:01');
const DST_MAC = mac2buf('aa:bb:cc:dd:ee:02');

function buildEthIPv4(ipPayload) {
    const eth = Buffer.alloc(14);
    DST_MAC.copy(eth, 0);
    SRC_MAC.copy(eth, 6);
    eth.writeUInt16BE(0x0800, 12);
    return Buffer.concat([eth, ipPayload]);
}

// ── IPv4 header builder ────────────────────────────────────────────────────

function buildIPv4(proto, srcIp, dstIp, payload) {
    const hdr = Buffer.alloc(20, 0);
    hdr[0] = 0x45;            // version=4, IHL=5
    hdr[1] = 0x00;            // DSCP/ECN
    hdr.writeUInt16BE(20 + payload.length, 2);  // total length
    hdr.writeUInt16BE(0x1234, 4);               // id
    hdr.writeUInt16BE(0x4000, 6);               // flags: DF
    hdr[8] = 64;              // TTL
    hdr[9] = proto;           // protocol
    ip2buf(srcIp).copy(hdr, 12);
    ip2buf(dstIp).copy(hdr, 16);
    hdr.writeUInt16BE(ipChecksum(hdr), 10);
    return Buffer.concat([hdr, payload]);
}

// ── TCP segment builder ────────────────────────────────────────────────────

function buildTCP(srcPort, dstPort, payload, flags = 0x18 /* PSH+ACK */) {
    const hdr = Buffer.alloc(20, 0);
    hdr.writeUInt16BE(srcPort, 0);
    hdr.writeUInt16BE(dstPort, 2);
    hdr.writeUInt32BE(1000, 4);   // seq
    hdr.writeUInt32BE(2000, 8);   // ack
    hdr[12] = 0x50;               // data offset = 5 * 4 = 20 bytes
    hdr[13] = flags;
    hdr.writeUInt16BE(65535, 14); // window
    return Buffer.concat([hdr, payload]);
}

// ── UDP segment builder ────────────────────────────────────────────────────

function buildUDP(srcPort, dstPort, payload) {
    const hdr = Buffer.alloc(8);
    hdr.writeUInt16BE(srcPort, 0);
    hdr.writeUInt16BE(dstPort, 2);
    hdr.writeUInt16BE(8 + payload.length, 4);
    hdr.writeUInt16BE(0, 6); // checksum (0 = ignored)
    return Buffer.concat([hdr, payload]);
}

// ── TLS ClientHello with SNI builder ──────────────────────────────────────

function buildTLSClientHello(sni) {
    const sniBytes = Buffer.from(sni);

    // SNI extension data: list_len(2) + type(1) + name_len(2) + name
    const sniExt = Buffer.alloc(5 + sniBytes.length);
    sniExt.writeUInt16BE(sniBytes.length + 3, 0); // list length
    sniExt[2] = 0x00;                              // name type = host_name
    sniExt.writeUInt16BE(sniBytes.length, 3);
    sniBytes.copy(sniExt, 5);

    const extBlock = Buffer.alloc(4 + sniExt.length);
    extBlock.writeUInt16BE(0x0000, 0); // extension type: SNI
    extBlock.writeUInt16BE(sniExt.length, 2);
    sniExt.copy(extBlock, 4);

    // Minimal ClientHello body
    const random = Buffer.alloc(32, 0xab);
    const cipherSuites = Buffer.from([0x00, 0x02, 0xc0, 0x2b]); // len + TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256
    const compression = Buffer.from([0x01, 0x00]);               // len + null
    const extensionsLen = Buffer.alloc(2);
    extensionsLen.writeUInt16BE(extBlock.length, 0);

    const body = Buffer.concat([
        Buffer.from([0x03, 0x03]),  // client version: TLS 1.2
        random,
        Buffer.from([0x00]),        // session id length = 0
        cipherSuites,
        compression,
        extensionsLen,
        extBlock,
    ]);

    // Handshake header: type(1) + length(3)
    const handshake = Buffer.alloc(4 + body.length);
    handshake[0] = 0x01; // ClientHello
    handshake[1] = (body.length >> 16) & 0xff;
    handshake[2] = (body.length >> 8) & 0xff;
    handshake[3] = body.length & 0xff;
    body.copy(handshake, 4);

    // TLS record
    const record = Buffer.alloc(5 + handshake.length);
    record[0] = 0x16;              // Handshake
    record.writeUInt16BE(0x0301, 1);
    record.writeUInt16BE(handshake.length, 3);
    handshake.copy(record, 5);

    return record;
}

// ── DNS query builder ──────────────────────────────────────────────────────

function buildDNSQuery(domain) {
    const hdr = Buffer.from([
        0x12, 0x34, // transaction id
        0x01, 0x00, // flags: standard query
        0x00, 0x01, // QDCOUNT = 1
        0x00, 0x00, // ANCOUNT
        0x00, 0x00, // NSCOUNT
        0x00, 0x00, // ARCOUNT
    ]);

    const parts = domain.split('.');
    const qname = Buffer.concat([
        ...parts.map(p => {
            const b = Buffer.alloc(1 + p.length);
            b[0] = p.length;
            Buffer.from(p).copy(b, 1);
            return b;
        }),
        Buffer.from([0x00]), // root label
    ]);

    const qtype = Buffer.from([0x00, 0x01]); // A
    const qclass = Buffer.from([0x00, 0x01]); // IN

    return Buffer.concat([hdr, qname, qtype, qclass]);
}

// ── PCAP packet record ─────────────────────────────────────────────────────

function pcapRecord(frame, tsSec, tsUsec = 0) {
    const hdr = Buffer.alloc(16);
    hdr.writeUInt32LE(tsSec, 0);
    hdr.writeUInt32LE(tsUsec, 4);
    hdr.writeUInt32LE(frame.length, 8);
    hdr.writeUInt32LE(frame.length, 12);
    return Buffer.concat([hdr, frame]);
}

// ── PCAP global header ─────────────────────────────────────────────────────

function pcapGlobalHeader() {
    const buf = Buffer.alloc(24);
    buf.writeUInt32LE(0xa1b2c3d4, 0); // magic
    buf.writeUInt16LE(2, 4);           // major version
    buf.writeUInt16LE(4, 6);           // minor version
    buf.writeInt32LE(0, 8);            // timezone
    buf.writeUInt32LE(0, 12);          // timestamp accuracy
    buf.writeUInt32LE(65535, 16);      // snaplen
    buf.writeUInt32LE(1, 20);          // network: LINKTYPE_ETHERNET
    return buf;
}

// ── Build all packets ──────────────────────────────────────────────────────

const packets = [];
let ts = 1700000000;

function addPacket(srcIp, dstIp, transport, usec = 0) {
    const frame = buildEthIPv4(buildIPv4(transport.proto, srcIp, dstIp, transport.payload));
    packets.push(pcapRecord(frame, ts++, usec));
}

// 1. Normal HTTP GET to example.com
const httpGet = Buffer.from('GET / HTTP/1.1\r\nHost: example.com\r\nConnection: keep-alive\r\n\r\n');
addPacket('192.168.1.10', '93.184.216.34',
    { proto: 6, payload: buildTCP(54321, 80, httpGet) });

// 2. Normal HTTP GET to google.com
const httpGetGoogle = Buffer.from('GET /search HTTP/1.1\r\nHost: www.google.com\r\nConnection: keep-alive\r\n\r\n');
addPacket('192.168.1.10', '142.250.80.46',
    { proto: 6, payload: buildTCP(54322, 80, httpGetGoogle) });

// 3. HTTPS → google.com (normal, GOOGLE app type)
addPacket('192.168.1.10', '142.250.80.46',
    { proto: 6, payload: buildTCP(54323, 443, buildTLSClientHello('www.google.com')) });

// 4. HTTPS → youtube.com  ← BLOCKED by app rule: YOUTUBE
addPacket('192.168.1.10', '142.250.80.100',
    { proto: 6, payload: buildTCP(54324, 443, buildTLSClientHello('www.youtube.com')) });

// 5. HTTPS → facebook.com ← BLOCKED by app rule: FACEBOOK
addPacket('192.168.1.11', '157.240.22.35',
    { proto: 6, payload: buildTCP(54325, 443, buildTLSClientHello('www.facebook.com')) });

// 6. HTTPS → tiktok.com  ← BLOCKED by app rule: TIKTOK
addPacket('192.168.1.12', '23.215.0.138',
    { proto: 6, payload: buildTCP(54326, 443, buildTLSClientHello('www.tiktok.com')) });

// 7. Traffic FROM blocked IP 10.0.0.66 ← BLOCKED by IP rule
const normalHttp = Buffer.from('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');
addPacket('10.0.0.66', '93.184.216.34',
    { proto: 6, payload: buildTCP(12345, 80, normalHttp) });

// 8. Traffic FROM another blocked IP 10.0.0.99 ← BLOCKED by IP rule
addPacket('10.0.0.99', '93.184.216.34',
    { proto: 6, payload: buildTCP(12346, 80, normalHttp) });

// 9. TCP on port 6881 (BitTorrent) ← BLOCKED by port rule
const torrentPayload = Buffer.from([0x13, 0x42, 0x69, 0x74, 0x54, 0x6f, 0x72, 0x72, 0x65, 0x6e, 0x74]);
addPacket('192.168.1.13', '45.33.32.156',
    { proto: 6, payload: buildTCP(54327, 6881, torrentPayload) });

// 10. DNS query for youtube.com (UDP 53)
addPacket('192.168.1.10', '8.8.8.8',
    { proto: 17, payload: buildUDP(54000, 53, buildDNSQuery('www.youtube.com')) });

// 11. DNS query for facebook.com (UDP 53)
addPacket('192.168.1.11', '8.8.8.8',
    { proto: 17, payload: buildUDP(54001, 53, buildDNSQuery('www.facebook.com')) });

// 12. HTTPS → netflix.com
addPacket('192.168.1.14', '54.230.0.1',
    { proto: 6, payload: buildTCP(54328, 443, buildTLSClientHello('www.netflix.com')) });

// 13. HTTPS → github.com (normal)
addPacket('192.168.1.10', '140.82.114.4',
    { proto: 6, payload: buildTCP(54329, 443, buildTLSClientHello('github.com')) });

// 14. HTTP response from server (src port 80)
const httpResp = Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 13\r\n\r\nHello, World!');
addPacket('93.184.216.34', '192.168.1.10',
    { proto: 6, payload: buildTCP(80, 54321, httpResp, 0x10 /* ACK */) });

// 15. HTTPS → twitter.com ← BLOCKED if twitter rule is active
addPacket('192.168.1.15', '104.244.42.1',
    { proto: 6, payload: buildTCP(54330, 443, buildTLSClientHello('twitter.com')) });

// 16. More HTTP from blocked IP
addPacket('10.0.0.66', '142.250.80.46',
    {
        proto: 6, payload: buildTCP(12347, 80,
            Buffer.from('GET /search HTTP/1.1\r\nHost: www.google.com\r\n\r\n'))
    });

// 17. ICMP ping (protocol 1)
const icmp = Buffer.from([0x08, 0x00, 0xf7, 0xff, 0x00, 0x01, 0x00, 0x01, ...Array(48).fill(0xab)]);
addPacket('192.168.1.10', '8.8.8.8',
    { proto: 1, payload: icmp });

// 18. HTTPS → amazon.com
addPacket('192.168.1.16', '52.94.236.114',
    { proto: 6, payload: buildTCP(54331, 443, buildTLSClientHello('www.amazon.com')) });

// 19. TCP on port 6881 from different host (more blocked port traffic)
addPacket('192.168.1.13', '82.221.103.244',
    { proto: 6, payload: buildTCP(54332, 6881, torrentPayload) });

// 20. HTTPS → cloudflare
addPacket('192.168.1.10', '1.1.1.1',
    { proto: 6, payload: buildTCP(54333, 443, buildTLSClientHello('1dot1dot1dot1.cloudflare-dns.com')) });

// ── Write PCAP ────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, '..', 'uploads', 'test_blocked_traffic.pcap');
const out = Buffer.concat([pcapGlobalHeader(), ...packets]);
fs.writeFileSync(outPath, out);

console.log(`✅ Written ${packets.length} packets → ${outPath}`);
console.log(`   File size: ${out.length} bytes`);
console.log('\nTraffic summary:');
console.log('  Normal   : HTTP example.com, google.com, HTTPS github.com, amazon.com, cloudflare, netflix.com');
console.log('  BLOCKED  : youtube.com (app), facebook.com (app), tiktok.com (app), twitter.com (app)');
console.log('  BLOCKED  : srcIP 10.0.0.66 and 10.0.0.99 (IP rule)');
console.log('  BLOCKED  : port 6881/tcp BitTorrent (port rule)');
console.log('  Other    : DNS, HTTP response, ICMP');
