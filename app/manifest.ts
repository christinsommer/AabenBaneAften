import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id:'/',name:'Åben Bane',short_name:'Åben Bane',
    description:'Tilmelding og kampplan til Åben Bane Aften.',
    lang:'da',start_url:'/',scope:'/',display:'standalone',
    background_color:'#042a52',theme_color:'#042a52',
    icons:[
      {src:'/brand/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/brand/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
    ],
  };
}

