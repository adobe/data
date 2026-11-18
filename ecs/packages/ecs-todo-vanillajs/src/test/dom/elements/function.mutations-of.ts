// © 2026 Adobe. MIT License. See /LICENSE for details.

/** The mutations `change` makes to `host` and its shadow root. */
export const mutationsOf = (host: Element, change: () => void): MutationRecord[] => {
    const observer = new MutationObserver(() => {});
    observer.observe(host, { attributes: true, childList: true, characterData: true, subtree: true });
    if (host.shadowRoot !== null) observer.observe(host.shadowRoot, { attributes: true, childList: true, characterData: true, subtree: true });
    change();
    const records = observer.takeRecords();
    observer.disconnect();
    return records;
};
