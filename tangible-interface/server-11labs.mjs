// example.mts
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";
import "dotenv/config";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

/** audio: ReadableStream<Uint8Array<ArrayBufferLike>> */
const audio = await elevenlabs.textToSoundEffects.convert({
  outputFormat: "pcm_22050",
  text: "Cinematic Braam, Horror",
  loop: true,
});

await play(audio);
