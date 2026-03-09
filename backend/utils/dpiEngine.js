/**
 * DPI Engine - Deep Packet Inspection
 * JavaScript port of the C++ DPI engine from perryvegehan/Packet_analyzer
 *
 * Handles:
 * - Ethernet / IP / TCP / UDP header parsing
 * - TLS SNI extraction from Client Hello
 * - HTTP Host header extraction
 * - Application classification
 * - Flow tracking
 * - Rule-based blocking
 */

// ─── App Type Classification ────────────────────────────────────────────────

const APP_TYPES = {
  UNKNOWN: 'UNKNOWN',
  HTTP: 'HTTP',
  HTTPS: 'HTTPS',
  DNS: 'DNS',
  GOOGLE: 'GOOGLE',
  YOUTUBE: 'YOUTUBE',
  FACEBOOK: 'FACEBOOK',
  TWITTER: 'TWITTER',
  NETFLIX: 'NETFLIX',
  TIKTOK: 'TIKTOK',
  GITHUB: 'GITHUB',
  AMAZON: 'AMAZON',
  MICROSOFT: 'MICROSOFT',
  APPLE: 'APPLE',
  CLOUDFLARE: 'CLOUDFLARE',
  OTHER: 'OTHER',
};

function sniToAppType(sni) {
  if (!sni) return APP_TYPES.UNKNOWN;
  const s = sni.toLowerCase();
  if (s.includes('youtube') || s.includes('googlevideo') || s.includes('ytimg')) return APP_TYPES.YOUTUBE;
  if (s.includes('facebook') || s.includes('fbcdn') || s.includes('instagram')) return APP_TYPES.FACEBOOK;
  if (s.includes('netflix') || s.includes('nflxso')) return APP_TYPES.NETFLIX;
  if (s.includes('tiktok') || s.includes('musical.ly')) return APP_TYPES.TIKTOK;
  if (s.includes('github')) return APP_TYPES.GITHUB;
  if (s.includes('twitter') || s.includes('twimg')) return APP_TYPES.TWITTER;
  if (s.includes('amazon') || s.includes('amazonaws')) return APP_TYPES.AMAZON;
  if (s.includes('microsoft') || s.includes('msn') || s.includes('live.com') || s.includes('office.com')) return APP_TYPES.MICROSOFT;
  if (s.includes('apple') || s.includes('icloud') || s.includes('mzstatic')) return APP_TYPES.APPLE;
  if (s.includes('cloudflare') || s.includes('1dot1dot1dot1')) return APP_TYPES.CLOUDFLARE;
  if (s.includes('google') || s.includes('gstatic') || s.includes('googleapis')) return APP_TYPES.GOOGLE;
  return APP_TYPES.HTTPS;
}

// ─── PCAP Parsing ───────────────────────────────────────────────────────────

const PCAP_MAGIC = 0xa1b2c3d4;
const PCAP_MAGIC_SWAPPED = 0xd4c3b2a1;
const PCAP_GLOBAL_HEADER_SIZE = 24;
const PCAP_PACKET_HEADER_SIZE = 16;

function parsePcapFile(buffer) {
  if (buffer.length < PCAP_GLOBAL_HEADER_SIZE) {
    throw new Error('File too small to be a valid PCAP');
  }

  const magic = buffer.readUInt32LE(0);
  let swapped = false;

  if (magic === PCAP_MAGIC) {
    swapped = false;
  } else if (magic === PCAP_MAGIC_SWAPPED) {
    swapped = true;
  } else {
    throw new Error(`Invalid PCAP magic number: 0x${magic.toString(16)}`);
  }

  const readU16 = (offset) => swapped ? buffer.readUInt16BE(offset) : buffer.readUInt16LE(offset);
  const readU32 = (offset) => swapped ? buffer.readUInt32BE(offset) : buffer.readUInt32LE(offset);

  const versionMajor = readU16(4);
  const versionMinor = readU16(6);
  const snaplen = readU32(16);
  const network = readU32(20); // 1 = Ethernet

  const packets = [];
  let offset = PCAP_GLOBAL_HEADER_SIZE;

  while (offset + PCAP_PACKET_HEADER_SIZE <= buffer.length) {
    const tsSec = readU32(offset);
    const tsUsec = readU32(offset + 4);
    const inclLen = readU32(offset + 8);
    const origLen = readU32(offset + 12);
    offset += PCAP_PACKET_HEADER_SIZE;

    if (offset + inclLen > buffer.length) break;

    const data = buffer.slice(offset, offset + inclLen);
    packets.push({ tsSec, tsUsec, inclLen, origLen, data });
    offset += inclLen;
  }

  return { versionMajor, versionMinor, snaplen, network, swapped, packets };
}

// ─── Ethernet Header Parsing ────────────────────────────────────────────────

function parseEthernet(buf) {
  if (buf.length < 14) return null;
  const dstMac = Array.from(buf.slice(0, 6)).map(b => b.toString(16).padStart(2, '0')).join(':');
  const srcMac = Array.from(buf.slice(6, 12)).map(b => b.toString(16).padStart(2, '0')).join(':');
  const etherType = buf.readUInt16BE(12);
  return { dstMac, srcMac, etherType, headerLen: 14 };
}

// ─── IP Header Parsing ──────────────────────────────────────────────────────

function parseIPv4(buf, offset) {
  if (buf.length - offset < 20) return null;
  const versionIhl = buf[offset];
  const ihl = (versionIhl & 0x0f) * 4;
  const totalLength = buf.readUInt16BE(offset + 2);
  const ttl = buf[offset + 8];
  const protocol = buf[offset + 9];
  const srcIp = Array.from(buf.slice(offset + 12, offset + 16)).join('.');
  const dstIp = Array.from(buf.slice(offset + 16, offset + 20)).join('.');
  return { ihl, totalLength, ttl, protocol, srcIp, dstIp, headerLen: ihl };
}

// ─── TCP Header Parsing ─────────────────────────────────────────────────────

function parseTCP(buf, offset) {
  if (buf.length - offset < 20) return null;
  const srcPort = buf.readUInt16BE(offset);
  const dstPort = buf.readUInt16BE(offset + 2);
  const seqNum = buf.readUInt32BE(offset + 4);
  const ackNum = buf.readUInt32BE(offset + 8);
  const dataOffset = ((buf[offset + 12] >> 4) & 0x0f) * 4;
  const flags = buf[offset + 13];
  const flagStr = [
    flags & 0x02 ? 'SYN' : '',
    flags & 0x10 ? 'ACK' : '',
    flags & 0x01 ? 'FIN' : '',
    flags & 0x04 ? 'RST' : '',
    flags & 0x08 ? 'PSH' : '',
    flags & 0x20 ? 'URG' : '',
  ].filter(Boolean).join('|');
  return { srcPort, dstPort, seqNum, ackNum, dataOffset, flags, flagStr };
}

// ─── UDP Header Parsing ─────────────────────────────────────────────────────

function parseUDP(buf, offset) {
  if (buf.length - offset < 8) return null;
  const srcPort = buf.readUInt16BE(offset);
  const dstPort = buf.readUInt16BE(offset + 2);
  const length = buf.readUInt16BE(offset + 4);
  return { srcPort, dstPort, length };
}

// ─── TLS SNI Extraction ─────────────────────────────────────────────────────
// Direct port of sni_extractor.cpp logic

function extractSNI(payload) {
  try {
    if (!payload || payload.length < 6) return null;

    // Check TLS Handshake record (0x16) and Client Hello (0x01)
    if (payload[0] !== 0x16) return null;
    if (payload[5] !== 0x01) return null;

    let offset = 43; // Past TLS record + handshake header + version + random

    if (offset >= payload.length) return null;

    // Skip Session ID
    const sessionIdLen = payload[offset];
    offset += 1 + sessionIdLen;
    if (offset >= payload.length) return null;

    // Skip Cipher Suites
    if (offset + 2 > payload.length) return null;
    const cipherSuitesLen = payload.readUInt16BE(offset);
    offset += 2 + cipherSuitesLen;
    if (offset >= payload.length) return null;

    // Skip Compression Methods
    const compressionLen = payload[offset];
    offset += 1 + compressionLen;
    if (offset >= payload.length) return null;

    // Extensions
    if (offset + 2 > payload.length) return null;
    const extensionsLen = payload.readUInt16BE(offset);
    offset += 2;

    const extEnd = offset + extensionsLen;

    while (offset + 4 <= extEnd && offset + 4 <= payload.length) {
      const extType = payload.readUInt16BE(offset);
      const extDataLen = payload.readUInt16BE(offset + 2);
      offset += 4;

      if (extType === 0x0000) {
        // SNI extension found
        if (offset + 5 > payload.length) return null;
        // sni list length (2) + sni type (1) + sni length (2) = 5
        const sniListLen = payload.readUInt16BE(offset);
        const sniType = payload[offset + 2];
        if (sniType !== 0x00) return null;
        const sniLen = payload.readUInt16BE(offset + 3);
        if (offset + 5 + sniLen > payload.length) return null;
        return payload.slice(offset + 5, offset + 5 + sniLen).toString('utf8');
      }

      offset += extDataLen;
    }
  } catch (e) {
    // Malformed packet - ignore
  }
  return null;
}

// ─── HTTP Host Extraction ───────────────────────────────────────────────────

function extractHTTPHost(payload) {
  try {
    const str = payload.toString('utf8', 0, Math.min(payload.length, 4096));
    const match = str.match(/^(?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) /);
    if (!match) return null;

    const hostMatch = str.match(/\r\nHost:\s*([^\r\n]+)/i);
    if (hostMatch) return hostMatch[1].trim();
  } catch (e) {}
  return null;
}

function extractHTTPMethod(payload) {
  try {
    const str = payload.toString('utf8', 0, Math.min(payload.length, 200));
    const match = str.match(/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) (\S+)/);
    if (match) return { method: match[1], path: match[2] };
  } catch (e) {}
  return null;
}

// ─── Flow Key ───────────────────────────────────────────────────────────────

function flowKey(srcIp, dstIp, srcPort, dstPort, protocol) {
  return `${srcIp}:${srcPort}-${dstIp}:${dstPort}-${protocol}`;
}

// ─── Protocol Name ──────────────────────────────────────────────────────────

function protocolName(proto) {
  const names = { 1: 'ICMP', 6: 'TCP', 17: 'UDP', 58: 'ICMPv6' };
  return names[proto] || `PROTO-${proto}`;
}

// ─── Rule Engine ────────────────────────────────────────────────────────────

function checkRules(rules, srcIp, appType, sni, dstPort) {
  for (const rule of rules) {
    if (!rule.active) continue;

    switch (rule.type) {
      case 'ip':
        if (srcIp && srcIp === rule.value) {
          return { blocked: true, reason: `IP blocked: ${rule.value}`, rule };
        }
        break;
      case 'app':
        if (appType && appType.toUpperCase() === rule.value.toUpperCase()) {
          return { blocked: true, reason: `App blocked: ${rule.value}`, rule };
        }
        break;
      case 'domain':
        if (sni && sni.toLowerCase().includes(rule.value.toLowerCase())) {
          return { blocked: true, reason: `Domain blocked: ${rule.value}`, rule };
        }
        break;
      case 'port':
        if (dstPort && dstPort === parseInt(rule.value)) {
          return { blocked: true, reason: `Port blocked: ${rule.value}`, rule };
        }
        break;
    }
  }
  return { blocked: false };
}

// ─── Main DPI Processing Function ───────────────────────────────────────────

function processPcapBuffer(buffer, rules = []) {
  const pcap = parsePcapFile(buffer);
  const flows = new Map();
  const parsedPackets = [];
  const blockedRuleHits = new Map(); // rule._id -> count

  let totalBytes = 0;
  let tcpCount = 0;
  let udpCount = 0;
  let forwardedCount = 0;
  let droppedCount = 0;
  const detectedDomains = new Set();

  for (let i = 0; i < pcap.packets.length; i++) {
    const raw = pcap.packets[i];
    const pkt = {
      index: i,
      timestamp: raw.tsSec,
      timestampUs: raw.tsUsec,
      capturedLength: raw.inclLen,
      originalLength: raw.origLen,
    };

    totalBytes += raw.origLen || raw.inclLen;

    // ── Ethernet ──
    const eth = parseEthernet(raw.data);
    if (!eth) { parsedPackets.push(pkt); continue; }

    pkt.srcMac = eth.srcMac;
    pkt.dstMac = eth.dstMac;
    pkt.etherType = `0x${eth.etherType.toString(16).padStart(4, '0')}`;

    // Only handle IPv4 (0x0800)
    if (eth.etherType !== 0x0800) { parsedPackets.push(pkt); continue; }

    // ── IPv4 ──
    const ipOffset = eth.headerLen;
    const ip = parseIPv4(raw.data, ipOffset);
    if (!ip) { parsedPackets.push(pkt); continue; }

    pkt.srcIp = ip.srcIp;
    pkt.dstIp = ip.dstIp;
    pkt.protocol = ip.protocol;
    pkt.protocolName = protocolName(ip.protocol);
    pkt.ttl = ip.ttl;
    pkt.ipLength = ip.totalLength;

    const transportOffset = ipOffset + ip.headerLen;

    // ── TCP ──
    if (ip.protocol === 6) {
      tcpCount++;
      const tcp = parseTCP(raw.data, transportOffset);
      if (tcp) {
        pkt.srcPort = tcp.srcPort;
        pkt.dstPort = tcp.dstPort;
        pkt.tcpFlags = tcp.flagStr;
        pkt.sequenceNumber = tcp.seqNum;
        pkt.ackNumber = tcp.ackNum;

        const payloadOffset = transportOffset + tcp.dataOffset;
        const payloadLen = raw.data.length - payloadOffset;
        pkt.payloadLength = Math.max(0, payloadLen);

        if (payloadLen > 0) {
          const payload = raw.data.slice(payloadOffset);

          // TLS SNI Extraction (HTTPS - port 443)
          if (tcp.dstPort === 443 || tcp.srcPort === 443) {
            pkt.appType = 'HTTPS';
            const sni = extractSNI(payload);
            if (sni) {
              pkt.sni = sni;
              pkt.isTlsClientHello = true;
              pkt.appType = sniToAppType(sni);
              detectedDomains.add(sni);
            }
          }

          // HTTP Host Extraction (port 80)
          if (tcp.dstPort === 80 || tcp.srcPort === 80) {
            pkt.appType = 'HTTP';
            const host = extractHTTPHost(payload);
            if (host) {
              pkt.httpHost = host;
              detectedDomains.add(host);
            }
            const httpInfo = extractHTTPMethod(payload);
            if (httpInfo) {
              pkt.httpMethod = httpInfo.method;
              pkt.httpPath = httpInfo.path;
            }
          }

          // DNS (port 53)
          if (tcp.dstPort === 53 || tcp.srcPort === 53) {
            pkt.appType = 'DNS';
          }
        }
      }
    }
    // ── UDP ──
    else if (ip.protocol === 17) {
      udpCount++;
      const udp = parseUDP(raw.data, transportOffset);
      if (udp) {
        pkt.srcPort = udp.srcPort;
        pkt.dstPort = udp.dstPort;
        pkt.payloadLength = udp.length - 8;

        if (udp.dstPort === 53 || udp.srcPort === 53) {
          pkt.appType = 'DNS';
        }
        // QUIC over UDP 443
        if (udp.dstPort === 443 || udp.srcPort === 443) {
          pkt.appType = 'HTTPS';
        }
      }
    }

    // ── Flow Tracking ──
    if (pkt.srcIp && pkt.dstIp) {
      const fk = flowKey(pkt.srcIp, pkt.dstIp, pkt.srcPort || 0, pkt.dstPort || 0, ip.protocol);
      if (!flows.has(fk)) {
        flows.set(fk, {
          srcIp: pkt.srcIp,
          dstIp: pkt.dstIp,
          srcPort: pkt.srcPort || 0,
          dstPort: pkt.dstPort || 0,
          protocol: ip.protocol,
          protocolName: pkt.protocolName,
          appType: pkt.appType || 'UNKNOWN',
          sni: pkt.sni || null,
          httpHost: pkt.httpHost || null,
          packetCount: 0,
          byteCount: 0,
          blocked: false,
          blockReason: null,
          firstSeen: raw.tsSec,
          lastSeen: raw.tsSec,
        });
      }

      const flow = flows.get(fk);
      flow.packetCount++;
      flow.byteCount += raw.origLen || raw.inclLen;
      flow.lastSeen = raw.tsSec;

      // Update flow classification if we got SNI
      if (pkt.sni && !flow.sni) {
        flow.sni = pkt.sni;
        flow.appType = pkt.appType;
      }
      if (pkt.httpHost && !flow.httpHost) {
        flow.httpHost = pkt.httpHost;
      }

      pkt.appType = pkt.appType || flow.appType || 'UNKNOWN';

      // ── Blocking Rules ──
      const blockResult = checkRules(
        rules,
        pkt.srcIp,
        pkt.appType,
        pkt.sni || pkt.httpHost,
        pkt.dstPort
      );

      if (blockResult.blocked || flow.blocked) {
        pkt.blocked = true;
        pkt.blockReason = blockResult.reason || flow.blockReason;
        flow.blocked = true;
        flow.blockReason = blockResult.reason || flow.blockReason;
        droppedCount++;

        if (blockResult.rule) {
          const ruleId = blockResult.rule._id?.toString();
          if (ruleId) {
            blockedRuleHits.set(ruleId, (blockedRuleHits.get(ruleId) || 0) + 1);
          }
        }
      } else {
        pkt.blocked = false;
        forwardedCount++;
      }
    } else {
      pkt.blocked = false;
      forwardedCount++;
    }

    if (!pkt.appType) pkt.appType = 'UNKNOWN';
    parsedPackets.push(pkt);
  }

  return {
    packets: parsedPackets,
    flows: Array.from(flows.values()),
    stats: {
      totalPackets: pcap.packets.length,
      totalBytes,
      tcpPackets: tcpCount,
      udpPackets: udpCount,
      forwardedPackets: forwardedCount,
      droppedPackets: droppedCount,
      uniqueFlows: flows.size,
      detectedDomains: Array.from(detectedDomains),
    },
    blockedRuleHits,
  };
}

module.exports = {
  APP_TYPES,
  sniToAppType,
  parsePcapFile,
  extractSNI,
  extractHTTPHost,
  processPcapBuffer,
};
