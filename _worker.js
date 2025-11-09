import { AwsClient } from "aws4fetch";

const EXPIRY = 3600;

const MIME = "application/vnd.git-lfs+json";

const METHOD_FOR = {
  upload: "PUT",
  download: "GET",
};

async function sign(s3, bucket, path, method) {
  const info = { method };
  const signed = await s3.sign(
    new Request(`https://${bucket}/${path}?X-Amz-Expires=${EXPIRY}`, info),
    { aws: { signQuery: true } },
  );
  return signed.url;
}

function parseAuthorization(req) {
  const auth = req.headers.get("Authorization");
  if (!auth) {
    throw new Response(null, { status: 401 });
  }

  const [scheme, encoded] = auth.split(" ");
  if (scheme !== "Basic" || !encoded) {
    throw new Response(null, { status: 400 });
  }

  const buffer = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const decoded = new TextDecoder().decode(buffer);
  const index = decoded.indexOf(":");
  if (index === -1) {
    throw new Response(null, { status: 400 });
  }

  return { user: decoded.slice(0, index), pass: decoded.slice(index + 1) };
}

async function fetch(req, env) {
  const url = new URL(req.url);

  // Only handle Git LFS batch endpoints
  if (!url.pathname.endsWith("/objects/batch")) {
    // Serve static assets (like index.html) for all other paths
    return env.ASSETS.fetch(req);
  }

  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  // in practice, we'd rather not break out-of-spec clients not setting these
  /*if (!req.headers.get("Accept").startsWith(MIME)
    || !req.headers.get("Content-Type").startsWith(MIME)) {
    return new Response(null, { status: 406 });
  }*/

  const { user, pass } = parseAuthorization(req);
  let s3Options = { accessKeyId: user, secretAccessKey: pass };

  const segments = url.pathname.split("/").slice(1, -2);
  let params = {};
  let bucketIdx = 0;
  for (const segment of segments) {
    const sliceIdx = segment.indexOf("=");
    if (sliceIdx === -1) {
      break;
    } else {
      const key = decodeURIComponent(segment.slice(0, sliceIdx));
      const val = decodeURIComponent(segment.slice(sliceIdx + 1));
      s3Options[key] = val;

      bucketIdx++;
    }
  }

  const s3 = new AwsClient(s3Options);
  const bucket = segments.slice(bucketIdx).join("/");
  const expires_in = params.expiry || env.EXPIRY || EXPIRY;

  const { objects, operation, hash_algo = "sha256" } = await req.json();

  if (hash_algo !== "sha256") {
    return new Response(
      JSON.stringify({
        message: `Hash algorithm '${hash_algo}' is not supported. Only 'sha256' is currently supported.`,
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/vnd.git-lfs+json" },
      },
    );
  }

  const method = METHOD_FOR[operation];
  const response = JSON.stringify({
    transfer: "basic",
    hash_algo: "sha256",
    objects: await Promise.all(
      objects.map(async ({ oid, size }) => ({
        oid,
        size,
        authenticated: true,
        actions: {
          [operation]: {
            href: await sign(s3, bucket, oid, method),
            expires_in,
          },
        },
      })),
    ),
  });

  return new Response(response, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/vnd.git-lfs+json",
    },
  });
}

export default { fetch };
