const root = document.querySelector<HTMLElement>('[data-offline]')!, status = root.querySelector<HTMLElement>('[data-offline-status]')!;
type Saved = Record<string, {
    bytes: number;
    version: string;
}>;
async function init() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext)
        throw new Error('Offline downloads are not supported here. Games still work online.');
    try {
        await navigator.serviceWorker.register('/play/sw.js', { scope: '/play/' });
    }
    catch (error) {
        if (!await navigator.serviceWorker.getRegistration('/play/'))
            throw error;
    }
    const registration = await navigator.serviceWorker.ready;
    function request(action: string, slug?: string): Promise<Saved> { return new Promise((resolve, reject) => { const channel = new MessageChannel(); const timer = window.setTimeout(() => { channel.port1.close(); reject(new Error('Download timed out. Try again online.')); }, 120000); channel.port1.onmessage = e => { if (e.data.progress !== undefined)
        status.textContent = `Downloading ${slug}: ${e.data.progress}%`; if (e.data.done || e.data.error) {
        clearTimeout(timer);
        channel.port1.close();
        e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.state);
    } }; registration.active!.postMessage({ action, slug }, [channel.port2]); }); }
    function render(saved: Saved) { root.querySelectorAll<HTMLElement>('[data-offline-game]').forEach(row => { const v = saved[row.dataset.offlineGame!]; row.querySelector('small')!.textContent = v ? `Downloaded · ${(v.bytes / 1024).toFixed(0)} KiB` : 'Not downloaded'; row.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = false); row.querySelector<HTMLButtonElement>('[data-remove]')!.disabled = !v; }); }
    render(await request('status'));
    status.textContent = 'Choose games to download. Completed downloads are ready offline.';
    root.addEventListener('click', async (e) => { const target = (e.target as Element).closest<HTMLButtonElement>('button'); if (!target)
        return; const row = target.closest<HTMLElement>('[data-offline-game]')!; root.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.disabled = true); try {
        render(await request(target.hasAttribute('data-remove') ? 'remove' : 'download', row.dataset.offlineGame));
        status.textContent = target.hasAttribute('data-remove') ? 'Download removed. Game progress kept.' : 'Download complete. Keep /play/ bookmarked for offline access.';
    }
    catch (error) {
        status.textContent = (error as Error).message;
        render(await request('status'));
    } });
}
init().catch(e => status.textContent = e.message);
export {};
