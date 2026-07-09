import type { AppProps } from "next/app";
import Head from "next/head";
import { Inter, Space_Grotesk } from "next/font/google";
import { AuthProvider } from "../hooks/useAuth";
import "../styles/globals.css";

// Inter for body text, Space Grotesk for headings and numbers -
// gives it a bit more character than one font everywhere
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Head>
        <title>NovaBank</title>
        <meta name="description" content="NovaBank - simple, modern online banking" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={`${inter.variable} ${space.variable} font-sans`}>
        <Component {...pageProps} />
      </div>
    </AuthProvider>
  );
}
