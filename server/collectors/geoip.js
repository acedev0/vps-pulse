import geoip from 'geoip-lite';

const ipCache = new Map();

// Known ASN / Organization heuristics for major cloud / CDN networks
function guessOrg(ip) {
  if (ip.startsWith('172.217.') || ip.startsWith('142.250.') || ip.startsWith('142.251.') || ip.startsWith('64.233.') || ip.startsWith('8.8.') || ip.startsWith('8.4.')) {
    return 'Google Cloud / Services';
  }
  if (ip.startsWith('104.16.') || ip.startsWith('104.17.') || ip.startsWith('104.18.') || ip.startsWith('104.19.') || ip.startsWith('104.20.') || ip.startsWith('104.21.') || ip.startsWith('172.64.') || ip.startsWith('1.1.1.')) {
    return 'Cloudflare CDN';
  }
  if (ip.startsWith('151.101.') || ip.startsWith('199.232.')) {
    return 'Fastly Global CDN';
  }
  if (ip.startsWith('91.108.') || ip.startsWith('149.154.')) {
    return 'Telegram Messenger DC';
  }
  if (ip.startsWith('43.153.') || ip.startsWith('43.163.') || ip.startsWith('43.134.') || ip.startsWith('43.129.')) {
    return 'Tencent Cloud Global';
  }
  if (ip.startsWith('13.107.') || ip.startsWith('20.') || ip.startsWith('40.') || ip.startsWith('52.')) {
    return 'Microsoft Azure';
  }
  if (ip.startsWith('54.') || ip.startsWith('3.') || ip.startsWith('34.') || ip.startsWith('35.') || ip.startsWith('18.')) {
    return 'Amazon Web Services';
  }
  if (ip.startsWith('139.162.') || ip.startsWith('172.104.') || ip.startsWith('172.105.')) {
    return 'Akamai / Linode Cloud';
  }
  if (ip.startsWith('159.65.') || ip.startsWith('167.99.') || ip.startsWith('138.68.')) {
    return 'DigitalOcean';
  }
  return null;
}

// Convert country code to flag emoji
export function getCountryFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function lookupIp(ip) {
  if (!ip) return null;
  
  // Clean IPv6-mapped IPv4 e.g. ::ffff:1.2.3.4
  const cleanIp = ip.replace(/^::ffff:/, '');
  
  if (ipCache.has(cleanIp)) {
    return ipCache.get(cleanIp);
  }

  // Check for private / loopback
  if (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp.startsWith('10.') ||
    cleanIp.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(cleanIp)
  ) {
    const localInfo = {
      ip: cleanIp,
      city: 'Localhost / Internal',
      country: 'LOCAL',
      countryName: 'Internal Network',
      flag: '🏠',
      ll: [1.2897, 103.8501], // default to Singapore node
      org: 'Local System',
      isLocal: true
    };
    ipCache.set(cleanIp, localInfo);
    return localInfo;
  }

  const geo = geoip.lookup(cleanIp);
  const guessedOrg = guessOrg(cleanIp);

  let result = null;
  if (geo && geo.ll && geo.ll.length >= 2) {
    result = {
      ip: cleanIp,
      city: geo.city || geo.region || 'Unknown City',
      country: geo.country || 'UN',
      flag: getCountryFlag(geo.country),
      ll: [geo.ll[0], geo.ll[1]], // [latitude, longitude]
      org: guessedOrg || `AS / ISP (${geo.country})`,
      isLocal: false
    };
  } else {
    // Fallback coordinates based on IP hash if lookup misses
    const hash = cleanIp.split('.').reduce((acc, oct) => (acc * 31 + parseInt(oct || '0', 10)) % 10000, 0);
    const mockLats = [37.7749, 51.5074, 35.6762, 1.3521, 52.5200, -33.8688, 22.3193, 40.7128];
    const mockLons = [-122.4194, -0.1278, 139.6503, 103.8198, 13.4050, 151.2093, 114.1694, -74.0060];
    const idx = hash % mockLats.length;
    
    result = {
      ip: cleanIp,
      city: 'Global Edge',
      country: 'GLOBAL',
      flag: '🌐',
      ll: [mockLats[idx], mockLons[idx]],
      org: guessedOrg || 'Public Internet Transit',
      isLocal: false
    };
  }

  if (ipCache.size > 2000) {
    ipCache.clear();
  }
  ipCache.set(cleanIp, result);
  return result;
}
