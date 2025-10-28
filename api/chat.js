export const config = { runtime: 'edge' };
export default async function handler(req){ if(req.method!=='POST') return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{'content-type':'application/json'}});
  const {message}=await req.json().catch(()=>({})); if(!message||typeof message!=='string') return new Response(JSON.stringify({error:'missing message'}),{status:400,headers:{'content-type':'application/json'}});
  const apiKey=process.env.OPENAI_API_KEY; if(!apiKey) return new Response(JSON.stringify({error:'missing OPENAI_API_KEY'}),{status:500,headers:{'content-type':'application/json'}});
  const body={model:'gpt-4o-mini',temperature:0.3,max_tokens:200,messages:[{role:'system',content:'Du bist der Support-Assistent von Droniq. Antworte kurz, sachlich, DE bevorzugt.'},{role:'user',content:message}]};
  const resp=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'authorization':'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify(body)});
  if(!resp.ok){const detail=await resp.text();return new Response(JSON.stringify({error:'openai_error',detail}),{status:500,headers:{'content-type':'application/json'}});}
  const data=await resp.json(); const answer=data?.choices?.[0]?.message?.content??'Entschuldigung, keine Antwort.'; return new Response(JSON.stringify({answer,citations:[]}),{status:200,headers:{'content-type':'application/json'}});
}