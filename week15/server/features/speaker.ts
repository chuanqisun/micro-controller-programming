import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

let activePlaybackProcess: ChildProcessWithoutNullStreams[] = [];

/**
 * Play a Wav audio buffer using ffplay.
 */
export async function playAudioThroughSpeakers(wavBuffer: Buffer): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const ffplay = spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", "-i", "pipe:0"]);

    // Track this process for cancellation
    activePlaybackProcess.push(ffplay);

    ffplay.on("error", reject);

    ffplay.on("close", (code) => {
      // Remove from active processes
      activePlaybackProcess = activePlaybackProcess.filter((proc) => proc !== ffplay);

      if (code === 0) {
        console.log("✓ Speaker playback completed");
        resolve();
      } else if (code === null || code === 255) {
        // Process was killed (likely by cancellation)
        console.log("⚠️  Speaker playback cancelled");
        resolve();
      } else {
        reject(new Error(`ffplay exited with code ${code}`));
      }
    });

    ffplay.stdin.write(wavBuffer);
    ffplay.stdin.end();
  });
}

export function cancelAllSpeakerPlayback() {
  for (const proc of activePlaybackProcess) {
    proc.kill();
  }
  activePlaybackProcess = [];
}

/**
 * Play a PCM16 audio buffer using ffplay.
 * @param audioBuffer - Raw PCM16 audio data (mono, 24kHz sample rate)
 * @returns Promise that resolves when playback completes
 */
export async function playPcm16Buffer(audioBuffer: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffplay = spawn("ffplay", [
      "-nodisp", // No display window
      "-autoexit", // Exit when playback finishes
      "-f",
      "s16le", // Signed 16-bit little-endian PCM
      "-ar",
      "24000", // 24kHz sample rate
      "-ac",
      "1", // Mono channel
      "-i",
      "pipe:0", // Read from stdin
    ]);

    activePlaybackProcess.push(ffplay);

    ffplay.on("error", (err) => {
      console.error("Error during playback:", err);
    });

    // Handle EPIPE errors when process is killed while writing
    ffplay.stdin.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EPIPE") {
        // Process was killed, ignore the error
        return;
      }
      console.error("Error writing to ffplay stdin:", err);
    });

    ffplay.on("close", (code) => {
      activePlaybackProcess = activePlaybackProcess.filter((proc) => proc !== ffplay);
      console.log("Playback process closed with code:", code);
      resolve();
    });

    ffplay.stdin.write(audioBuffer);
    ffplay.stdin.end();
  });
}
