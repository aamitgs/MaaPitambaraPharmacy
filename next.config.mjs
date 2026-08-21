/** @type {import('next').NextConfig} */
/**
 * `standalone` bundles a self-contained server for the shop machine's Docker
 * image. It is a self-hosting mode, and a cloud host builds its own server
 * from the file trace instead — leaving it on there makes the platform's
 * post-build step look for trace output the standalone build does not put
 * where it expects, and the build fails after compiling everything
 * successfully.
 *
 * Both targets are real for this app: the till runs on-site, the same repo
 * also deploys to the cloud. So the output mode follows the target rather
 * than one being sacrificed for the other.
 */
const isCloudHost = Boolean(process.env.VERCEL);

const nextConfig = {
  ...(isCloudHost ? {} : { output: "standalone" }),
  async headers() {
    return [
      {
        // The worker must never be cached: a stale copy would keep serving
        // an old shell long after a deploy, and it is the one file that
        // controls what the till sees offline.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
