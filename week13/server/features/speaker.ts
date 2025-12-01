import { spawn, type ChildProcessWithoutNullStreams } from "child_process";

let activePlaybackProcess: ChildProcessWithoutNullStreams[] = [];

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
