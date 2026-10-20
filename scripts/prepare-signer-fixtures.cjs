// Download public diagnostic fixtures into the ignored cache, never training data.
const fs=require('node:fs'),path=require('node:path')
const root=path.join(__dirname,'..'),dir=path.join(root,'.sign-data-cache/camera-stage34')
async function prepare({holistic=false}={}) {
  fs.mkdirSync(dir,{recursive:true})
  const files=[['pose.jpg','https://storage.googleapis.com/mediapipe-assets/pose.jpg'],
    ['portrait.jpg','https://storage.googleapis.com/mediapipe-assets/portrait.jpg'],
    ['thumb-up.jpg','https://storage.googleapis.com/mediapipe-assets/thumb_up.jpg']]
  if(holistic)files.push(['holistic_landmarker.task','https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task'])
  for(const[name,url]of files)if(!fs.existsSync(path.join(dir,name))){
    const response=await fetch(url,{signal:AbortSignal.timeout(60000)})
    if(!response.ok)throw new Error(`Fixture unavailable: ${url}`)
    fs.writeFileSync(path.join(dir,name),Buffer.from(await response.arrayBuffer()))
  }
}
module.exports={prepare}
if(require.main===module)prepare({holistic:process.argv.includes('--holistic')}).catch(error=>{console.error(error);process.exit(1)})
