const isDev = process.env.NODE_ENV !== "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
	// Keep dev-compiled pages/chunks around longer to avoid transient missing module errors
	// when accessed via tunnels/reverse proxies.
	onDemandEntries: isDev
		? {
				maxInactiveAge: 24 * 60 * 60 * 1000, // 24h
				pagesBufferLength: 5,
			}
		: undefined,
};
export default nextConfig;
