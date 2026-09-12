/** A request only owns the result until the next edit or request. */
export function createResultState() {
    let revision = 0, text = '';
    return {
        get text() { return text; }, get revision() { return revision; },
        invalidate() { text = ''; return ++revision; },
        accept(value: string, token = revision) { if (token !== revision)
            return false; text = value; return true; },
        current(token: number) { return token === revision; }
    };
}
