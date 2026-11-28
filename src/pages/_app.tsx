import type { AppProps } from "next/app";
import Head from "next/head";
import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { api } from "~/utils/api";
import "~/styles/globals.css";

function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  // iOS Safari ignores user-scalable=no, so stop its whole-page pinch zoom here.
  // The photo grid handles pinch itself (photo size), and the viewer has tap-to-zoom.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    return () => { document.removeEventListener("gesturestart", stop); document.removeEventListener("gesturechange", stop); };
  }, []);
  return (
    <SessionProvider session={session}>
      <Head>
        <title>Volta</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#0E131F" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}` }} />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
export default api.withTRPC(App);
