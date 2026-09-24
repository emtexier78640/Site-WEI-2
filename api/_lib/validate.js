// api/_lib/validate.js — validation de corps de requête, sans dépendance.
// validate(body, schema) → { ok: true, value } | { ok: false, error: 'message FR' }
// Schéma : { champ: { type: 'string'|'int'|'bool'|'date'|'enum', required?, min?, max?, values?, pattern?, label? } }
// - chaînes trimées ; 'date' attend YYYY-MM-DD (et une date réelle) ; clés inconnues supprimées ;
// - champ optionnel absent → undefined ; min/max = longueur pour string, valeur pour int.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isBlank(v) {
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function fail(error) {
    return { ok: false, error };
}

function checkField(name, rule, raw) {
    const label = rule.label || name;
    if (isBlank(raw)) {
        if (rule.required) return { error: `Le champ « ${label} » est obligatoire.` };
        return { value: undefined };
    }

    switch (rule.type) {
        case 'string': {
            if (typeof raw !== 'string') return { error: `Le champ « ${label} » est invalide.` };
            const v = raw.trim();
            if (rule.min !== undefined && v.length < rule.min) {
                return { error: `Le champ « ${label} » doit contenir au moins ${rule.min} caractères.` };
            }
            if (rule.max !== undefined && v.length > rule.max) {
                return { error: `Le champ « ${label} » ne doit pas dépasser ${rule.max} caractères.` };
            }
            if (rule.pattern && !rule.pattern.test(v)) {
                return { error: `Le format du champ « ${label} » est invalide.` };
            }
            return { value: v };
        }
        case 'int': {
            let n;
            if (typeof raw === 'number') n = raw;
            else if (typeof raw === 'string' && /^-?\d+$/.test(raw.trim())) n = Number(raw.trim());
            else return { error: `Le champ « ${label} » doit être un nombre entier.` };
            if (!Number.isSafeInteger(n)) return { error: `Le champ « ${label} » doit être un nombre entier.` };
            if (rule.min !== undefined && n < rule.min) {
                return { error: `Le champ « ${label} » doit être supérieur ou égal à ${rule.min}.` };
            }
            if (rule.max !== undefined && n > rule.max) {
                return { error: `Le champ « ${label} » doit être inférieur ou égal à ${rule.max}.` };
            }
            return { value: n };
        }
        case 'bool': {
            if (typeof raw === 'boolean') return { value: raw };
            if (raw === 'true' || raw === 1 || raw === '1') return { value: true };
            if (raw === 'false' || raw === 0 || raw === '0') return { value: false };
            return { error: `Le champ « ${label} » doit être vrai ou faux.` };
        }
        case 'date': {
            if (typeof raw !== 'string') return { error: `Le champ « ${label} » est invalide.` };
            const v = raw.trim();
            const m = DATE_RE.exec(v);
            if (!m) return { error: `Le champ « ${label} » doit être au format AAAA-MM-JJ.` };
            const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
            const dt = new Date(Date.UTC(y, mo - 1, d));
            if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d
                || y < 1900 || y > 2100) {
                return { error: `Le champ « ${label} » n'est pas une date valide.` };
            }
            return { value: v };
        }
        case 'enum': {
            if (typeof raw !== 'string') return { error: `Le champ « ${label} » est invalide.` };
            const v = raw.trim();
            if (!Array.isArray(rule.values) || !rule.values.includes(v)) {
                return { error: `La valeur du champ « ${label} » n'est pas autorisée.` };
            }
            return { value: v };
        }
        default:
            return { error: `Le champ « ${label} » est invalide.` };
    }
}

export function validate(body, schema) {
    if (body === undefined || body === null) body = {};
    if (typeof body !== 'object' || Array.isArray(body)) return fail('Corps de requête invalide.');

    const value = {};
    for (const [name, rule] of Object.entries(schema)) {
        const raw = Object.prototype.hasOwnProperty.call(body, name) ? body[name] : undefined;
        const r = checkField(name, rule, raw);
        if (r.error) return fail(r.error);
        if (r.value !== undefined) value[name] = r.value;
        else value[name] = undefined;
    }
    return { ok: true, value };
}
