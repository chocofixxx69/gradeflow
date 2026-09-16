let _metaCache = null;
let _metaCacheTime = 0;
const META_CACHE_TTL = 60_000; // 60 seconds

export function getSystemMetaCache() {
    const now = Date.now();
    if (_metaCache && (now - _metaCacheTime) < META_CACHE_TTL) {
        return _metaCache;
    }
    return null;
}

export function setSystemMetaCache(data) {
    _metaCache = data;
    _metaCacheTime = Date.now();
}

export function clearSystemMetaCache() {
    _metaCache = null;
    _metaCacheTime = 0;
}
