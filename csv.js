function parseCsv(text, delimiter = ';') {
    const rows = [];
    const source = (text || '').replace(/^\uFEFF/, '');
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        const next = source[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (!inQuotes && char === delimiter) {
            row.push(cell.trim());
            cell = '';
            continue;
        }

        if (!inQuotes && (char === '\n' || char === '\r')) {
            if (char === '\r' && next === '\n') i++;
            row.push(cell.trim());
            cell = '';

            const hasContent = row.some(value => value !== '');
            if (hasContent) rows.push(row);
            row = [];
            continue;
        }

        cell += char;
    }

    row.push(cell.trim());
    if (row.some(value => value !== '')) rows.push(row);

    return rows;
}
