// Word lists and tables the checks use. Sources: the Zalando RESTful API guidelines
// (status code legend, headers, formats), the IANA registries, common usage.

// #141: words that are verbs first. Words as often nouns (order, report, return) are left
// to #134, which flags any singular segment anyway.
export const VERBS = new Set(`
accept activate add apply approve archive assign attach authenticate authorize block build
calculate cancel charge check clear clone close collect compare complete compute confirm connect
convert copy create deactivate decline decrypt delete deliver deny deploy detach disable disconnect
dismiss do download duplicate edit enable encrypt enroll evaluate execute expire export extend fetch
find finish freeze generate get grant hide import increment decrement init initialize initiate insert
install invalidate invite invoke join kill launch leave list load lock login logout make mark merge
migrate modify move notify open pause pay perform ping process publish pull push put read rebuild
recalculate receive recover redeem refresh register reject reload remove rename renew reopen repeat
replace reply resend reserve reset resolve restart restore resume retrieve retry revert revoke
rollback rotate run save scan search select send set show sign signin signout signup skip sort split
start stop submit subscribe suspend swap sync synchronize terminate toggle trigger unarchive unassign
unblock undo unfollow unlink unlock unpublish unsubscribe update upgrade upload upsert validate verify
withdraw write
`.split(/\s+/).filter(Boolean));

// #142: resource names too general to say what the resource is.
export const GENERIC_RESOURCES = new Set(['items', 'objects', 'entities', 'resources', 'records', 'elements', 'things', 'data', 'info', 'details', 'values', 'entries', 'stuff', 'misc']);

// #103: British spellings U.S. English does not use, and their U.S. form. Variants both use
// (cancelled, catalogue, grey) are left out.
export const BRITISH = new Map(Object.entries({
  colour: 'color', colours: 'colors', coloured: 'colored', favour: 'favor', favourite: 'favorite',
  favourites: 'favorites', behaviour: 'behavior', behaviours: 'behaviors', honour: 'honor', labour: 'labor',
  neighbour: 'neighbor', neighbours: 'neighbors', rumour: 'rumor', flavour: 'flavor', flavours: 'flavors',
  harbour: 'harbor', humour: 'humor', vapour: 'vapor', endeavour: 'endeavor',
  centre: 'center', centres: 'centers', metre: 'meter', metres: 'meters', litre: 'liter', litres: 'liters',
  fibre: 'fiber', calibre: 'caliber', defence: 'defense', offence: 'offense',
  licence: 'license', licences: 'licenses', pretence: 'pretense', 
  programme: 'program', programmes: 'programs', cheque: 'check', cheques: 'checks',
  tyre: 'tire', tyres: 'tires', aluminium: 'aluminum', jewellery: 'jewelry', mould: 'mold',
  manoeuvre: 'maneuver', paediatric: 'pediatric', draught: 'draft', plough: 'plow', storey: 'story',
  artefact: 'artifact', artefacts: 'artifacts', sceptical: 'skeptical', ageing: 'aging', whilst: 'while',
  learnt: 'learned', spelt: 'spelled', focussed: 'focused', practise: 'practice',
  marvellous: 'marvelous',
  enrol: 'enroll', enrolment: 'enrollment', enrolments: 'enrollments', fulfil: 'fulfill',
  fulfilment: 'fulfillment', fulfilments: 'fulfillments', instalment: 'installment',
  instalments: 'installments', skilful: 'skillful', wilful: 'willful',
  organise: 'organize', organised: 'organized', organising: 'organizing', organisation: 'organization',
  organisations: 'organizations', organisational: 'organizational', authorise: 'authorize',
  authorised: 'authorized', authorising: 'authorizing', authorisation: 'authorization',
  authorisations: 'authorizations', unauthorised: 'unauthorized', realise: 'realize', realised: 'realized',
  recognise: 'recognize', recognised: 'recognized', prioritise: 'prioritize', prioritised: 'prioritized',
  summarise: 'summarize', summarised: 'summarized', customise: 'customize', customised: 'customized',
  customisation: 'customization', optimise: 'optimize', optimised: 'optimized', optimisation: 'optimization',
  finalise: 'finalize', finalised: 'finalized', utilise: 'utilize', utilised: 'utilized', minimise: 'minimize',
  minimised: 'minimized', maximise: 'maximize', maximised: 'maximized', standardise: 'standardize',
  standardised: 'standardized', synchronise: 'synchronize', synchronised: 'synchronized',
  synchronisation: 'synchronization', categorise: 'categorize', categorised: 'categorized',
  initialise: 'initialize', initialised: 'initialized', initialisation: 'initialization',
  normalise: 'normalize', normalised: 'normalized', normalisation: 'normalization', serialise: 'serialize',
  serialised: 'serialized', serialisation: 'serialization', deserialise: 'deserialize',
  materialise: 'materialize', specialise: 'specialize', specialised: 'specialized', visualise: 'visualize',
  visualisation: 'visualization', analyse: 'analyze', analysed: 'analyzed', analysing: 'analyzing',
  paralyse: 'paralyze', catalyse: 'catalyze', capitalise: 'capitalize', centralise: 'centralize',
  centralised: 'centralized', characterise: 'characterize', emphasise: 'emphasize', generalise: 'generalize',
  localise: 'localize', localised: 'localized', localisation: 'localization', memorise: 'memorize',
  modernise: 'modernize', monetise: 'monetize', neutralise: 'neutralize', penalise: 'penalize',
  personalise: 'personalize', personalised: 'personalized', personalisation: 'personalization',
  randomise: 'randomize', randomised: 'randomized', sanitise: 'sanitize', sanitised: 'sanitized',
  stabilise: 'stabilize', tokenise: 'tokenize', digitise: 'digitize', anonymise: 'anonymize',
  anonymised: 'anonymized', pseudonymise: 'pseudonymize', parameterise: 'parameterize',
  parametrise: 'parametrize', virtualise: 'virtualize', virtualisation: 'virtualization',
  itemise: 'itemize', itemised: 'itemized', harmonise: 'harmonize', legalise: 'legalize',
  utilisation: 'utilization', realisation: 'realization',
}));

// #103: function words that mark a text as German, French, Dutch or Spanish.
// Words that are also common English words are left out.
export const STOPWORDS = {
  German: new Set('und oder nicht ist sind wird werden wurde der das dem ein eine einer eines einem für auf bei zum zur über unter von vom nach auch keine wenn dann sowie bitte diese dieser dieses wir zu im aus sich kann können muss müssen'.split(' ')),
  French: new Set('le les du une est sont avec pour dans sur pas qui que ou et au aux ce cette ces être été peut doit sans mais aussi nous vous leur leurs'.split(' ')),
  Dutch: new Set('het een niet van voor met zijn wordt worden deze dat ook naar bij uit maar nog wel geen kan moet alle wanneer omdat zoals onze uw'.split(' ')),
  Spanish: new Set('el los las una por para con del es que se lo como pero más este esta estos sin sobre también puede debe cuando donde'.split(' ')),
};

// Status codes registered at IANA (#243).
export const IANA_STATUS = new Set([
  100, 101, 102, 103, 104,
  200, 201, 202, 203, 204, 205, 206, 207, 208, 226,
  300, 301, 302, 303, 304, 305, 307, 308,
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 421, 422,
  423, 424, 425, 426, 428, 429, 431, 451,
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
].map(String));

// #150: the status code legend. Common codes, codes to avoid, codes not to document.
export const COMMON_STATUS = new Set(['200', '201', '202', '204', '207', '304', '400', '401', '403', '404', '405', '406', '409', '410', '411', '412', '415', '423', '428', '429', '431', '500', '501', '502', '503', '504', '507']);

export const DO_NOT_USE_STATUS = new Set(['205', '206', '301', '302', '303', '307', '308', '408', '417', '418', '422', '424', '505', '511']);

export const REDIRECT_STATUS = new Set(['301', '302', '303', '307', '308']);

export const DO_NOT_DOCUMENT_STATUS = new Set(['401', '403', '404', '406', '410', '412', '415', '428', '429', '431', '500', '502', '503', '504', '507']);

export const STATUS_METHODS = {
  201: ['post', 'put'],
  202: ['post', 'put', 'patch', 'delete', 'get'],
  204: ['post', 'put', 'patch', 'delete'],
  207: ['post', 'delete'],
  304: ['get', 'head'],
  409: ['post', 'put', 'patch', 'delete'],
  411: ['post', 'put', 'patch'],
  412: ['put', 'patch', 'delete'],
  415: ['post', 'put', 'patch'],
  423: ['put', 'patch', 'delete'],
  507: ['post', 'put', 'patch'],
};

export const REASON_PHRASES = {
  400: 'bad request', 401: 'unauthorized', 403: 'forbidden', 404: 'not found', 405: 'method not allowed',
  406: 'not acceptable', 409: 'conflict', 410: 'gone', 412: 'precondition failed', 415: 'unsupported media type',
  428: 'precondition required', 429: 'too many requests', 431: 'request header fields too large',
  500: 'internal server error', 502: 'bad gateway', 503: 'service unavailable', 504: 'gateway timeout',
  507: 'insufficient storage',
};

// Standard request and response headers (RFC 9110 and friends, IANA field registry).
export const STANDARD_HEADERS = new Set([
  'A-IM', 'Accept', 'Accept-Charset', 'Accept-Datetime', 'Accept-Encoding', 'Accept-Language', 'Accept-Patch',
  'Accept-Post', 'Accept-Ranges', 'Access-Control-Allow-Credentials', 'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods', 'Access-Control-Allow-Origin', 'Access-Control-Expose-Headers',
  'Access-Control-Max-Age', 'Access-Control-Request-Headers', 'Access-Control-Request-Method', 'Age', 'Allow',
  'Alt-Svc', 'Authorization', 'Cache-Control', 'Connection', 'Content-Disposition', 'Content-Encoding',
  'Content-Language', 'Content-Length', 'Content-Location', 'Content-MD5', 'Content-Range',
  'Content-Security-Policy', 'Content-Type', 'Cookie', 'Date', 'Delta-Base', 'Deprecation', 'Digest', 'DNT',
  'ETag', 'Expect', 'Expires', 'Forwarded', 'From', 'Host', 'Idempotency-Key', 'IM', 'If-Match',
  'If-Modified-Since', 'If-None-Match', 'If-Range', 'If-Unmodified-Since', 'Last-Modified', 'Link', 'Location',
  'Max-Forwards', 'Origin', 'Pragma', 'Prefer', 'Preference-Applied', 'Priority', 'Proxy-Authenticate',
  'Proxy-Authorization', 'Range', 'Referer', 'Retry-After', 'Server', 'Set-Cookie', 'Strict-Transport-Security',
  'Sunset', 'TE', 'Trailer', 'Transfer-Encoding', 'Upgrade', 'User-Agent', 'Vary', 'Via', 'Warning',
  'WWW-Authenticate', 'traceparent', 'tracestate',
].map((h) => h.toLowerCase()));

// #183: proprietary headers the guideline specifies, plus the gateway headers its linter allows.
export const SPECIFIED_PROPRIETARY_HEADERS = new Set([
  'X-Flow-ID', 'X-Tenant-ID', 'X-Sales-Channel', 'X-Frontend-Type', 'X-Device-Type', 'X-Device-OS',
  'X-Mobile-Advertising-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset',
  'X-Zalando-Customer', 'X-Zalando-Client-ID', 'X-Zalando-Request-Host', 'X-Zalando-Request-URI', 'X-Consumer',
  'X-Consumer-Signature', 'X-Consumer-Key-ID', 'X-App-Version', 'X-Country-Code', 'X-Zalando-Auth',
  'X-Forwarded-For',
].map((h) => h.toLowerCase()));

// #132: header names whose established spelling does not follow the word pattern.
export const HEADER_CASE_EXCEPTIONS = new Set(['ETag', 'WWW-Authenticate', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'traceparent', 'tracestate', 'DNT', 'TE', 'IM', 'A-IM']);

// #137: names used for paging, sorting, search, field filters and embedding instead of the conventional ones.
export const QUERY_SYNONYMS = new Map(Object.entries({
  page_size: 'limit', pagesize: 'limit', per_page: 'limit', perpage: 'limit', max_results: 'limit', maxresults: 'limit',
  top: 'limit', take: 'limit', max_items: 'limit', page_limit: 'limit',
  page_token: 'cursor', pagetoken: 'cursor', next_token: 'cursor', nexttoken: 'cursor', continuation_token: 'cursor',
  continuation: 'cursor', marker: 'cursor', start_after: 'cursor', page_cursor: 'cursor', next_cursor: 'cursor',
  skip: 'offset', start_index: 'offset', startindex: 'offset', page: 'offset or cursor', page_number: 'offset or cursor',
  page_no: 'offset or cursor', page_index: 'offset or cursor',
  order_by: 'sort', orderby: 'sort', sort_by: 'sort', sortby: 'sort', order: 'sort', ordering: 'sort', sort_order: 'sort',
  query: 'q', search: 'q', search_term: 'q', search_query: 'q', keyword: 'q', keywords: 'q',
  select: 'fields', field_mask: 'fields', include_fields: 'fields',
  expand: 'embed',
}));

// #238: formats the guideline lists, with the number formats of #171.
export const STRING_FORMATS = new Set([
  'byte', 'binary', 'date', 'time', 'date-time', 'time-local', 'date-time-local', 'tz-id', 'duration', 'period',
  'password', 'email', 'idn-email', 'hostname', 'idn-hostname', 'ipv4', 'ipv6', 'uri', 'uri-reference',
  'uri-template', 'iri', 'iri-reference', 'uuid', 'json-pointer', 'relative-json-pointer', 'regex',
  'iso-639-1', 'bcp47', 'iso-3166-alpha-2', 'iso-4217', 'gtin-13', 'cursor',
]);

// #238: format names that mean a standard format under another name.
export const FORMAT_ALIASES = new Map(Object.entries({
  datetime: 'date-time', date_time: 'date-time', timestamp: 'date-time', iso8601: 'date-time',
  'iso-8601': 'date-time', rfc3339: 'date-time', 'rfc-3339': 'date-time', 'date-time-utc': 'date-time',
  url: 'uri', 'iso-639': 'iso-639-1', iso639: 'iso-639-1', 'iso-3166': 'iso-3166-alpha-2', iso3166: 'iso-3166-alpha-2',
  'iso-3166-1': 'iso-3166-alpha-2', 'iso-3166-1-alpha-2': 'iso-3166-alpha-2', iso4217: 'iso-4217',
  currency: 'iso-4217', 'country-code': 'iso-3166-alpha-2', 'language-code': 'iso-639-1', guid: 'uuid',
  'e-mail': 'email', ip: 'ipv4 or ipv6', 'ip-address': 'ipv4 or ipv6', base64: 'byte', base64url: 'byte',
  int: 'int32', long: 'int64',
}));

export const DATE_TIME_FORMATS = new Set(['date', 'time', 'time-local', 'date-time', 'date-time-local', 'duration', 'period']);

export const INTEGER_FORMATS = new Set(['int32', 'int64', 'bigint']);

export const NUMBER_FORMATS = new Set(['float', 'double', 'decimal']);
