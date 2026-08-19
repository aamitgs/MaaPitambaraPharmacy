import nextConfig from "eslint-config-next";

const config = [{ ignores: ["src/generated/**"] }, ...nextConfig];

export default config;
