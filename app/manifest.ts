import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id:'/',name:'Åben Bane Aften',short_name:'Åben Bane',
    description:'Tilmelding og kampplan til Åben Bane Aften.',
    lang:'da',start_url:'/',scope:'/',display:'standalone',
    background_color:'#f6f9f7',theme_color:'#13375e',
    icons:[
      {src:'/AppTennisLogo.png',sizes:'1253x1253',type:'image/png',purpose:'any'},
    ],
  };
}

