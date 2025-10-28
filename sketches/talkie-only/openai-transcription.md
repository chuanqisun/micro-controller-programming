Follow this example to transcribe audio file to text

```js
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI();

const stream = await openai.audio.transcriptions.create({
  file: fs.createReadStream("audio.mp3"),
  model: "gpt-4o-mini-transcribe",
  stream: true,
});

for await (const event of stream) {
  console.log(event);
}
```
