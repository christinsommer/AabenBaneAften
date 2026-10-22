import Link from 'next/link';
import { cookieSections,PRIVACY_VERSION } from '../../lib/privacy-text';
export default function Page(){return <main className="mx-auto max-w-3xl space-y-6 p-6"><Link href="/">Til Åben Bane</Link><h1 className="text-3xl font-bold">Cookieinformation</h1><p>Version {PRIVACY_VERSION}</p>{cookieSections.map(([title,text])=><section key={title}><h2 className="text-xl font-semibold">{title}</h2><p>{text}</p></section>)}<a href="/privacy">Privatlivsinformation</a></main>;}
