/**
 * BUG-3: patrones de detección de inyección de prompts.
 * Solo DATOS — la lógica de sanitización vive en InputSanitizerService.
 * Para añadir un idioma: agregar su lista y concatenarla en ALL_INJECTION_PATTERNS.
 */

export const INJECTION_PATTERNS_EN: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /forget\s+(all\s+)?previous\s+instructions?/i,
  /new\s+(system\s+)?prompt\s*:/i,
  /system\s*:\s*(you are|act as|pretend)/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<\/?system>/i,
  /###\s*instruction/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /what\s+(are|were)\s+your\s+(original\s+)?instructions?/i,
  /pretend\s+(you\s+are|to\s+be)\s/i,
  /act\s+as\s+(?:DAN|GPT-?4|an?\s+uncensored|an?\s+unfiltered|an?\s+unrestricted)/i,
];

export const INJECTION_PATTERNS_ES: RegExp[] = [
  /ignora\s+(todas\s+)?(las\s+|tus\s+)?(instrucciones|indicaciones|reglas)\s*(anteriores|previas)?/i,
  /olvida\s+(todas\s+)?(las\s+|tus\s+)?(instrucciones|indicaciones|reglas)/i,
  /nuevo\s+prompt\s+(del\s+)?sistema\s*:/i,
  /sistema\s*:\s*(eres|act[uú]a como|finge)/i,
  /(mu[eé]strame|rev[eé]lame|dime|ens[eé]ñame)\s+(tus?\s+)?(prompt|instrucciones|configuraci[oó]n)(\s+(del\s+)?sistema)?/i,
  /cu[aá]les?\s+(son|eran)\s+tus\s+instrucciones\s*(originales|del sistema)?/i,
  /act[uú]a\s+como\s+(?:DAN|un?\s+(asistente|bot|IA)?\s*(sin\s+(restricciones|filtros|censura)|no\s+(filtrado|restringido|censurado)))/i,
  /finge\s+(que\s+eres|ser)\s/i,
  /desactiva\s+(tus\s+)?(filtros|restricciones|reglas)/i,
  /sal(te)?\s+de\s+tu\s+(rol|personaje)/i,
];

export const ALL_INJECTION_PATTERNS: RegExp[] = [
  ...INJECTION_PATTERNS_EN,
  ...INJECTION_PATTERNS_ES,
];
