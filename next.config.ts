import type {NextConfig} from 'next';
import { getCatalogImageHosts } from './src/lib/catalog/image-hosts';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentUpgrade: 'security',
  },
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  images: {
    remotePatterns: [
      ...getCatalogImageHosts().map((hostname) => ({
        protocol: 'https' as const,
        hostname,
        port: '',
        pathname: '/**',
      })),
    ],
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Genkit's OpenTelemetry SDK loads Jaeger only when explicitly configured.
      // This app uses the default exporter and does not ship Jaeger support.
      '@opentelemetry/exporter-jaeger': false,
    };
    return config;
  },
};

export default nextConfig;
