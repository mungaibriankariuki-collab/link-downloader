const { downloadToFolder } = require('./download-engine');
const fs = require('fs');
const path = require('path');

(async () => {
  const dir = path.join(__dirname, 'test-downloads');
  fs.rmSync(dir, { recursive: true, force: true });

  const tests = [
    { name: 'image', url: 'https://httpbin.org/image/png', filename: 'test-image.png' },
    { name: 'json-as-file', url: 'https://httpbin.org/bytes/2048', filename: 'test-bytes.bin' }
  ];

  let failures = 0;

  for (const t of tests) {
    const progressEvents = [];
    const result = await downloadToFolder({
      url: t.url,
      filename: t.filename,
      directory: dir,
      id: t.name,
      onProgress: (p) => progressEvents.push(p)
    });

    if (result.success) {
      const stat = fs.statSync(result.path);
      console.log(`PASS [${t.name}] saved=${result.path} size=${stat.size} progressEvents=${progressEvents.length}`);
    } else {
      failures++;
      console.log(`FAIL [${t.name}] ${result.error || (result.cancelled ? 'cancelled' : 'unknown')}`);
    }
  }

  const badResult = await downloadToFolder({
    url: 'not-a-url',
    filename: 'bad.bin',
    directory: dir,
    id: 'bad',
    onProgress: () => {}
  });
  if (!badResult.success) {
    console.log(`PASS [invalid-url] rejected with: ${badResult.error}`);
  } else {
    failures++;
    console.log('FAIL [invalid-url] should have been rejected');
  }

  const notFound = await downloadToFolder({
    url: 'https://httpbin.org/status/404',
    filename: 'nf.bin',
    directory: dir,
    id: 'nf',
    onProgress: () => {}
  });
  if (!notFound.success) {
    console.log(`PASS [http-404] rejected with: ${notFound.error}`);
  } else {
    failures++;
    console.log('FAIL [http-404] should have been rejected');
  }

  console.log(failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
