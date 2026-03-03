const https = require('https');
const TOKEN = process.env.GH_TOKEN;

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': 'token ' + TOKEN,
        'User-Agent': 'zenith',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const releases = await apiRequest('GET', '/repos/Xenoow/zenith/releases');
  const draft = releases.find(x => x.draft);
  if (!draft) { console.log('Aucun draft trouvé.'); return; }
  console.log('Draft trouvé:', draft.tag_name, '(id:', draft.id + ')');
  const result = await apiRequest('PATCH', '/repos/Xenoow/zenith/releases/' + draft.id, { draft: false });
  console.log('Release publiée :', result.tag_name, '| draft:', result.draft, '| url:', result.html_url);
}

main().catch(console.error);
