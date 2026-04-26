import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GET as socialGet, POST as socialPost } from './api/social.js';
import { GET as socialAuthGet } from './api/social-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

async function toWebRequest(req) {
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const url = new URL(req.url, `http://${req.headers.host}`);

    return new Request(url, {
        method: req.method,
        headers: req.headers,
        body
    });
}

async function sendWebResponse(nodeResponse, webResponse) {
    nodeResponse.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
        nodeResponse.setHeader(key, value);
    });

    const body = Buffer.from(await webResponse.arrayBuffer());
    nodeResponse.end(body);
}

function resolveStaticPath(urlPathname) {
    if (urlPathname === '/' || urlPathname === '/admin' || urlPathname === '/admin.html') {
        return path.join(rootDir, 'admin.html');
    }

    const normalizedPath = path
        .normalize(urlPathname)
        .replace(/^(\.\.[/\\])+/, '')
        .replace(/^[/\\]+/, '');

    return path.join(rootDir, normalizedPath);
}

const server = createServer(async (req, res) => {
    try {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);

        if (requestUrl.pathname === '/api/social') {
            const webRequest = await toWebRequest(req);
            const webResponse = req.method === 'POST'
                ? await socialPost(webRequest)
                : await socialGet(webRequest);

            await sendWebResponse(res, webResponse);
            return;
        }

        if (requestUrl.pathname === '/api/social-auth') {
            const webRequest = await toWebRequest(req);
            const webResponse = await socialAuthGet(webRequest);
            await sendWebResponse(res, webResponse);
            return;
        }

        const targetPath = resolveStaticPath(requestUrl.pathname);
        const fileBuffer = await readFile(targetPath);
        const extension = path.extname(targetPath).toLowerCase();
        res.statusCode = 200;
        res.setHeader('content-type', contentTypes[extension] || 'application/octet-stream');
        res.end(fileBuffer);
    } catch (error) {
        res.statusCode = error?.code === 'ENOENT' ? 404 : 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
            ok: false,
            error: error?.code === 'ENOENT' ? 'Arquivo nao encontrado.' : 'Falha no servidor local.'
        }));
    }
});

server.listen(port, () => {
    console.log(`Servidor local ativo em http://127.0.0.1:${port}`);
});
