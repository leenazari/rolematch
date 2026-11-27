const crypto = require('node:crypto');
exports.memoryDb = function () {
  const tables = new Map(), pdfs = new Map();
  const rows = table => { if (!tables.has(table)) tables.set(table, new Map()); return tables.get(table); };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.operation = 'select'; }
    select() { return this; }
    eq(key,value) { this.filters.push(row => row[key] === value); return this; }
    insert(values) { this.operation = 'insert'; this.values = values; return this; }
    update(values) { this.operation = 'update'; this.values = values; return this; }
    execute(single = false) {
      const table = rows(this.table);
      if (this.operation === 'insert') {
        const value = { id: crypto.randomUUID(), attempts: 0, updated_at: new Date().toISOString(), ...this.values };
        if (table.has(value.id) || (this.table === 'pitch_email_outbox' && [...table.values()].some(row => row.report_id === value.report_id && row.recipient_role === value.recipient_role))) return { data: null, error: { code: '23505' } };
        table.set(value.id, value);
        return { data: structuredClone(value), error: null };
      }
      const found = [...table.values()].filter(row => this.filters.every(filter => filter(row)));
      if (this.operation === 'update') for (const row of found) Object.assign(row, this.values);
      return { data: structuredClone(single ? found[0] || null : found), error: null };
    }
    single() { return Promise.resolve(this.execute(true)); }
    maybeSingle() { return Promise.resolve(this.execute(true)); }
    then(resolve,reject) { return Promise.resolve(this.execute()).then(resolve,reject); }
  }
  const storage = { PITCH_PDF_BUCKET: 'pitch-reports', pitchStorageClient: () => ({ from: table => new Query(table),
    storage: { from: () => ({ download: async path => ({ data: pdfs.has(path) ? new Blob([pdfs.get(path)]) : null, error: null }) }) } }) };
  return { rows, pdfs, storage };
};
