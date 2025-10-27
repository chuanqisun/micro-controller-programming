# Using realtime models

Use realtime models and prompting effectively.

Realtime models are post-trained for specific customer use cases. In response to your feedback, the latest speech-to-speech model works differently from previous models. Use this guide to understand and get the most out of it.

## Meet the models

Our most advanced speech-to-speech model is [gpt-realtime](/docs/models/gpt-realtime).

This model shows improvements in following complex instructions, calling tools, and producing speech that sounds natural and expressive. For more information, see the [announcement blog post](https://openai.com/index/introducing-gpt-realtime/).

## Update your session to use a prompt

After you initiate a session over [WebRTC](/docs/guides/realtime-webrtc), [WebSocket](/docs/guides/realtime-websocket), or [SIP](/docs/guides/realtime-sip), the client and model are connected. The server will send a [session.created](/docs/api-reference/realtime-server-events/session/created) event to confirm. Now it's a matter of prompting.

### Basic prompt update

1.  Create a basic audio prompt in [the dashboard](/audio/realtime).

    If you don't know where to start, experiment with the prompt fields until you find something interesting. You can always manage, iterate on, and version your prompts later.

2.  Update your realtime session to use the prompt you created. Provide its prompt ID in a `session.update` client event:

Update the system instructions used by the model in this session

```javascript
const event = {
  type: "session.update",
  session: {
    type: "realtime",
    model: "gpt-realtime",
    // Lock the output to audio (set to ["text"] if you want text without audio)
    output_modalities: ["audio"],
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: 24000,
        },
        turn_detection: {
          type: "semantic_vad",
        },
      },
      output: {
        format: {
          type: "audio/pcm",
        },
        voice: "marin",
      },
    },
    // Use a server-stored prompt by ID. Optionally pin a version and pass variables.
    prompt: {
      id: "pmpt_123", // your stored prompt ID
      version: "89", // optional: pin a specific version
      variables: {
        city: "Paris", // example variable used by your prompt
      },
    },
    // You can still set direct session fields; these override prompt fields if they overlap:
    instructions: "Speak clearly and briefly. Confirm understanding before taking actions.",
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
```

```python
event = {
    "type": "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime",
      # Lock the output to audio (add "text" if you also want text)
      output_modalities: ["audio"],
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          turn_detection: {
            type: "semantic_vad"
          }
        },
        output: {
          format: {
            type: "audio/pcmu",
          },
          voice: "marin",
        }
      },
      # Use a server-stored prompt by ID. Optionally pin a version and pass variables.
      prompt: {
        id: "pmpt_123",          // your stored prompt ID
        version: "89",           // optional: pin a specific version
        variables: {
          city: "Paris"          // example variable used by your prompt
        }
      },
      # You can still set direct session fields; these override prompt fields if they overlap:
      instructions: "Speak clearly and briefly. Confirm understanding before taking actions."
    }
}
ws.send(json.dumps(event))
```

When the session's updated, the server emits a [session.updated](/docs/api-reference/realtime-server-events/session/updated) event with the new state of the session. You can update the session any time.

### Changing prompt mid-call

To update the session mid-call (to swap prompt version or variables, or override instructions), send the update over the same data channel you're using:

```javascript
// Example: switch to a specific prompt version and change a variable
dc.send(
  JSON.stringify({
    type: "session.update",
    session: {
      type: "realtime",
      prompt: {
        id: "pmpt_123",
        version: "89",
        variables: {
          city: "Berlin",
        },
      },
    },
  })
);

// Example: override instructions (note: direct session fields take precedence over Prompt fields)
dc.send(
  JSON.stringify({
    type: "session.update",
    session: {
      type: "realtime",
      instructions: "Speak faster and keep answers under two sentences.",
    },
  })
);
```

## Prompting gpt-realtime

Here are top tips for prompting the realtime speech-to-speech model. For a more in-depth guide to prompting, see the [realtime prompting cookbook](https://cookbook.openai.com/examples/realtime_prompting_guide).

### General usage tips

- **Iterate relentlessly**. Small wording changes can make or break behavior.

  Example: Swapping “inaudible” → “unintelligible” improved noisy input handling.

- **Use bullets over paragraphs**. Clear, short bullets outperform long paragraphs.
- **Guide with examples**. The model strongly follows onto sample phrases.
- **Be precise**. Ambiguity and conflicting instructions degrade performance, similar to GPT-5.
- **Control language**. Pin output to a target language if you see drift.
- **Reduce repetition**. Add a variety rule to reduce robotic phrasing.
- **Use all caps for emphasis**: Capitalize key rules to makes them stand out to the model.
- **Convert non-text rules to text**: The model responds better to clearly written text.

  Example: Instead of writing, "IF x > 3 THEN ESCALATE", write, "IF MORE THAN THREE FAILURES THEN ESCALATE."

### Structure your prompt

Organize your prompt to help the model understand context and stay consistent across turns.

Use clear, labeled sections in your system prompt so the model can find and follow them. Keep each section focused on one thing.

```markdown
# Role & Objective — who you are and what “success” means

# Personality & Tone — the voice and style to maintain

# Context — retrieved context, relevant info

# Reference Pronunciations — phonetic guides for tricky words

# Tools — names, usage rules, and preambles

# Instructions / Rules — do’s, don’ts, and approach

# Conversation Flow — states, goals, and transitions

# Safety & Escalation — fallback and handoff logic
```

This format also makes it easier for you to iterate and modify problematic sections.

To make this system prompt your own, add domain-specific sections (e.g., Compliance, Brand Policy) and remove sections you don’t need. In each section, provide instructions and other information for the model to respond correctly. See specifics below.

## Practical tips for prompting realtime models

Here are 10 tips for creating effective, consistently performing prompts with gpt-realtime. These are just an overview. For more details and full system prompt examples, see the [realtime prompting cookbook](https://cookbook.openai.com/examples/realtime_prompting_guide).

#### 1\. Be precise. Kill conflicts.

The new realtime model is very good at instruction following. However, that also means small wording changes or unclear instructions can shift behavior in meaningful ways. Inspect and iterate on your system prompt to try different phrasing and fix instruction contradictions.

In one experiment we ran, changing the word "inaudible" to "unintelligble" in instructions for handling noisy inputs significantly improved the model's performance.

After your first attempt at a system prompt, have an LLM review it for ambiguity or conflicts.

#### 2\. Bullets > paragraphs.

Realtime models follow short bullet points better than long paragraphs.

Before (harder to follow):

```markdown
When you can’t clearly hear the user, don’t proceed. If there’s background noise or you only caught part of the sentence, pause and ask them politely to repeat themselves in their preferred language, and make sure you keep the conversation in the same language as the user.
```

After (easier to follow):

```markdown
Only respond to clear audio or text.

If audio is unclear/partial/noisy/silent, ask for clarification in `{preferred_language}`.

Continue in the same language as the user if intelligible.
```

#### 3\. Handle unclear audio.

The realtime model is good at following instructions on how to handle unclear audio. Spell out what to do when audio isn’t usable.

```markdown
## Unclear audio

- Always respond in the same language the user is speaking in, if intelligible.
- Default to English if the input language is unclear.
- Only respond to clear audio or text.
- If the user's audio is not clear (e.g., ambiguous input/background noise/silent/unintelligible) or if you did not fully hear or understand the user, ask for clarification using {preferred_language} phrases.

Sample clarification phrases (parameterize with {preferred_language}):

- “Sorry, I didn’t catch that—could you say it again?”
- “There’s some background noise. Please repeat the last part.”
- “I only heard part of that. What did you say after \_\_\_?”
```

#### 4\. Constrain the model to one language.

If you see the model switching languages in an unhelpful way, add a dedicated "Language" section in your prompt. Make sure it doesn’t conflict with other rules. By default, mirroring the user’s language works well.

Here's a simple way to mirror the user's language:

```markdown
## Language

Language matching: Respond in the same language as the user unless directed otherwise.
For non-English, start with the same standard accent/dialect the user uses.
```

Here's an example of an English-only constraint:

```markdown
## Language

- The conversation will be only in English.
- Do not respond in any other language, even if the user asks.
- If the user speaks another language, politely explain that support is limited to English.
```

In a language teaching application, your language and conversation sections might look like this:

```markdown
## Language

### Explanations

Use English when explaining grammar, vocabulary, or cultural context.

### Conversation

Speak in French when conducting practice, giving examples, or engaging in dialogue.
```

You can also control dialect for a more consistent personality:

```markdown
## Language

Response only in argentine spanish.
```

#### 5\. Provide sample phrases and flow snippets.

The model learns style from examples. Give short, varied samples for common conversation moments.

For example, you might give this high-level shape of conversation flow to the model:

```markdown
Greeting → Discover → Verify → Diagnose → Resolve → Confirm/Close. Advance only when criteria in each phase are met.
```

And then provide prompt guidance for each section. For example, here's how you might instruct for the greeting section:

```markdown
## Conversation flow — Greeting

Goal: Set tone and invite the reason for calling.

How to respond:

- Identify as ACME Internet Support.
- Keep it brief; invite the caller’s goal.

Sample phrases (vary, don’t always reuse):

- “Thanks for calling ACME Internet—how can I help today?”
- “You’ve reached ACME Support. What’s going on with your service?”
- “Hi there—tell me what you’d like help with.”

Exit when: Caller states an initial goal or symptom.
```

#### 6\. Avoid robotic repetition.

If responses sound repetitive or robotic, include an explicit variety instruction. This can sometimes happen when using sample phrases.

```markdown
## Variety

- Do not repeat the same sentence twice. Vary your responses so it doesn't sound robotic.
```

#### 7\. Use capitalized text to emphasize instructions.

Like many LLMs, using capitalization for important rules can help the model to understand and follow those rules. It's also helpful to convert non-text rules (such as numerical conditions) into text before capitalization.

Instead of:

```markdown
## Rules

- If [func.return_value] > 0, respond 1 to the user.
```

Use:

```markdown
## Rules

- IF [func.return_value] IS BIGGER THAN 0, RESPOND 1 TO THE USER.
```

#### 8\. Help the model use tools.

The model's use of tools can alter the experience—how much they rely on user confirmation vs. taking action, what they say while they make the tool call, which rules they follow for each specific tool, etc.

One way to prompt for tool usage is to use preambles. Good preambles instruct the model to give the user some feedback about what it's doing before it makes the tool call, so the user always knows what's going on.

Here's an example:

```markdown
# Tools

- Before any tool call, say one short line like “I’m checking that now.” Then call the tool immediately.
```

You can include sample phrases for preambles to add variety and better tailor to your use case.

There are several other ways to improve the model's behavior when performing tool calls and keeping the conversation going with the user. Ideally, the model is calling the right tools proactively, checking for confirmation for any important write actions, and keeping the user informed along the way. For more specifics, see the [realtime prompting cookbook](https://cookbook.openai.com/examples/realtime_prompting_guide).

#### 9\. Use LLMs to improve your prompt.

LLMs are great at finding what's going wrong in your prompt. Use ChatGPT or the API to get a model's review of your current realtime prompt and get help improving it.

Whether your prompt is working well or not, here's a prompt you can run to get a model's review:

```markdown
## Role & Objective

You are a **Prompt-Critique Expert**.
Examine a user-supplied LLM prompt and surface any weaknesses following the instructions below.

## Instructions

Review the prompt that is meant for an LLM to follow and identify the following issues:

- Ambiguity: Could any wording be interpreted in more than one way?
- Lacking Definitions: Are there any class labels, terms, or concepts that are not defined that might be misinterpreted by an LLM?
- Conflicting, missing, or vague instructions: Are directions incomplete or contradictory?
- Unstated assumptions: Does the prompt assume the model has to be able to do something that is not explicitly stated?

## Do **NOT** list issues of the following types:

- Invent new instructions, tool calls, or external information. You do not know what tools need to be added that are missing.
- Issues that you are not sure about.

## Output Format

# Issues

- Numbered list; include brief quote snippets.

# Improvements

- Numbered list; provide the revised lines you would change and how you would changed them.

# Revised Prompt

- Revised prompt where you have applied all your improvements surgically with minimal edits to the original prompt
```

Use this template as a starting point for troubleshooting a recurring issue:

```markdown
Here's my current prompt to an LLM:
[BEGIN OF CURRENT PROMPT]
{CURRENT_PROMPT}
[END OF CURRENT PROMPT]

But I see this issue happening from the LLM:
[BEGIN OF ISSUE]
{ISSUE}
[END OF ISSUE]
Can you provide some variants of the prompt so that the model can better understand the constraints to alleviate the issue?
```

#### 10\. Help users resolve issues faster.

Two frustrating user experiences are slow, mechanical voice agents and the inability to escalate. Help users faster by providing instructions in your system prompt for speed and escalation.

In the personality and tone section of your system prompt, add pacing instructions to get the model to quicken its support:

```markdown
# Personality & Tone

## Personality

Friendly, calm and approachable expert customer service assistant.

## Tone

Tone: Warm, concise, confident, never fawning.

## Length

2–3 sentences per turn.

## Pacing

Deliver your audio response fast, but do not sound rushed. Do not modify the content of your response, only increase speaking speed for the same response.
```

Often with realtime voice agents, having a reliable way to escalate to a human is important. In a safety and escalation section, modify the instructions on WHEN to escalate depending on your use case. Here's an example:

```markdown
# Safety & Escalation

When to escalate (no extra troubleshooting):

- Safety risk (self-harm, threats, harassment)
- User explicitly asks for a human
- Severe dissatisfaction (e.g., “extremely frustrated,” repeated complaints, profanity)
- **2** failed tool attempts on the same task **or** **3** consecutive no-match/no-input events
- Out-of-scope or restricted (e.g., real-time news, financial/legal/medical advice)

What to say at the same time of calling the escalate_to_human tool (MANDATORY):

- “Thanks for your patience—**I’m connecting you with a specialist now**.”
- Then call the tool: `escalate_to_human`

Examples that would require escalation:

- “This is the third time the reset didn’t work. Just get me a person.”
- “I am extremely frustrated!”
```

## Further reading

This guide is long but not exhaustive! For more in a specific area, see the following resources:

- [Realtime prompting cookbook](https://cookbook.openai.com/examples/realtime_prompting_guide): Full prompt examples and a deep dive into when and how to use them
- [Inputs and outputs](/docs/guides/realtime-inputs-outputs): Text and audio input requirements and output options
- [Managing conversations](/docs/guides/realtime-conversations): Learn to manage a conversation for the duration of a realtime session
- [Webhooks and server-side controls](/docs/guides/realtime-server-controls): Create a sideband channel to separate sensitive server-side logic from an untrusted client
- [Function calling](/docs/guides/realtime-function-calling): How to call functions in your realtime app
- [MCP servers](/docs/guides/realtime-mcp): How to use MCP servers to access additional tools in realtime apps
- [Realtime transcription](/docs/guides/realtime-transcription): How to transcribe audio with the Realtime API
- [Voice agents](https://openai.github.io/openai-agents-js/guides/voice-agents/quickstart/): A quickstart for building a voice agent with the Agents SDK

Was this page useful?

# Realtime conversations

Learn how to manage Realtime speech-to-speech conversations.

Once you have connected to the Realtime API through either [WebRTC](/docs/guides/realtime-webrtc) or [WebSocket](/docs/guides/realtime-websocket), you can call a Realtime model (such as [gpt-realtime](/docs/models/gpt-realtime)) to have speech-to-speech conversations. Doing so will require you to **send client events** to initiate actions, and **listen for server events** to respond to actions taken by the Realtime API.

This guide will walk through the event flows required to use model capabilities like audio and text generation and function calling, and how to think about the state of a Realtime Session.

If you do not need to have a conversation with the model, meaning you don't expect any response, you can use the Realtime API in [transcription mode](/docs/guides/realtime-transcription).

## Realtime speech-to-speech sessions

A Realtime Session is a stateful interaction between the model and a connected client. The key components of the session are:

- The **Session** object, which controls the parameters of the interaction, like the model being used, the voice used to generate output, and other configuration.
- A **Conversation**, which represents user input Items and model output Items generated during the current session.
- **Responses**, which are model-generated audio or text Items that are added to the Conversation.

**Input audio buffer and WebSockets**

If you are using WebRTC, much of the media handling required to send and receive audio from the model is assisted by WebRTC APIs.

If you are using WebSockets for audio, you will need to manually interact with the **input audio buffer** by sending audio to the server, sent with JSON events with base64-encoded audio.

All these components together make up a Realtime Session. You will use client events to update the state of the session, and listen for server events to react to state changes within the session.

![diagram realtime state](https://openaidevs.retool.com/api/file/11fe71d2-611e-4a26-a587-881719a90e56)

## Session lifecycle events

After initiating a session via either [WebRTC](/docs/guides/realtime-webrtc) or [WebSockets](/docs/guides/realtime-websockets), the server will send a [`session.created`](/docs/api-reference/realtime-server-events/session/created) event indicating the session is ready. On the client, you can update the current session configuration with the [`session.update`](/docs/api-reference/realtime-client-events/session/update) event. Most session properties can be updated at any time, except for the `voice` the model uses for audio output, after the model has responded with audio once during the session. The maximum duration of a Realtime session is **30 minutes**.

The following example shows updating the session with a `session.update` client event. See the [WebRTC](/docs/guides/realtime-webrtc#sending-and-receiving-events) or [WebSocket](/docs/guides/realtime-websocket#sending-and-receiving-events) guide for more on sending client events over these channels.

Update the system instructions used by the model in this session

```javascript
const event = {
  type: "session.update",
  session: {
    type: "realtime",
    model: "gpt-realtime",
    // Lock the output to audio (set to ["text"] if you want text without audio)
    output_modalities: ["audio"],
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: 24000,
        },
        turn_detection: {
          type: "semantic_vad",
        },
      },
      output: {
        format: {
          type: "audio/pcm",
        },
        voice: "marin",
      },
    },
    // Use a server-stored prompt by ID. Optionally pin a version and pass variables.
    prompt: {
      id: "pmpt_123", // your stored prompt ID
      version: "89", // optional: pin a specific version
      variables: {
        city: "Paris", // example variable used by your prompt
      },
    },
    // You can still set direct session fields; these override prompt fields if they overlap:
    instructions: "Speak clearly and briefly. Confirm understanding before taking actions.",
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
```

```python
event = {
    "type": "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime",
      # Lock the output to audio (add "text" if you also want text)
      output_modalities: ["audio"],
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          turn_detection: {
            type: "semantic_vad"
          }
        },
        output: {
          format: {
            type: "audio/pcmu",
          },
          voice: "marin",
        }
      },
      # Use a server-stored prompt by ID. Optionally pin a version and pass variables.
      prompt: {
        id: "pmpt_123",          // your stored prompt ID
        version: "89",           // optional: pin a specific version
        variables: {
          city: "Paris"          // example variable used by your prompt
        }
      },
      # You can still set direct session fields; these override prompt fields if they overlap:
      instructions: "Speak clearly and briefly. Confirm understanding before taking actions."
    }
}
ws.send(json.dumps(event))
```

When the session has been updated, the server will emit a [`session.updated`](/docs/api-reference/realtime-server-events/session/updated) event with the new state of the session.

||
|session.update|session.createdsession.updated|

## Text inputs and outputs

To generate text with a Realtime model, you can add text inputs to the current conversation, ask the model to generate a response, and listen for server-sent events indicating the progress of the model's response. In order to generate text, the [session must be configured](/docs/api-reference/realtime-client-events/session/update) with the `text` modality (this is true by default).

Create a new text conversation item using the [`conversation.item.create`](/docs/api-reference/realtime-client-events/conversation/item/create) client event. This is similar to sending a [user message (prompt) in Chat Completions](/docs/guides/text-generation) in the REST API.

Create a conversation item with user input

```javascript
const event = {
  type: "conversation.item.create",
  item: {
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text: "What Prince album sold the most copies?",
      },
    ],
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
```

```python
event = {
    "type": "conversation.item.create",
    "item": {
        "type": "message",
        "role": "user",
        "content": [
            {
                "type": "input_text",
                "text": "What Prince album sold the most copies?",
            }
        ]
    }
}
ws.send(json.dumps(event))
```

After adding the user message to the conversation, send the [`response.create`](/docs/api-reference/realtime-client-events/response/create) event to initiate a response from the model. If both audio and text are enabled for the current session, the model will respond with both audio and text content. If you'd like to generate text only, you can specify that when sending the `response.create` client event, as shown below.

Generate a text-only response

```javascript
const event = {
  type: "response.create",
  response: {
    output_modalities: ["text"],
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
```

```python
event = {
    "type": "response.create",
    "response": {
        "output_modalities": [ "text" ]
    }
}
ws.send(json.dumps(event))
```

When the response is completely finished, the server will emit the [`response.done`](/docs/api-reference/realtime-server-events/response/done) event. This event will contain the full text generated by the model, as shown below.

Listen for response.done to see the final results

```javascript
function handleEvent(e) {
  const serverEvent = JSON.parse(e.data);
  if (serverEvent.type === "response.done") {
    console.log(serverEvent.response.output[0]);
  }
}

// Listen for server messages (WebRTC)
dataChannel.addEventListener("message", handleEvent);

// Listen for server messages (WebSocket)
// ws.on("message", handleEvent);
```

```python
def on_message(ws, message):
    server_event = json.loads(message)
    if server_event.type == "response.done":
        print(server_event.response.output[0])
```

While the model response is being generated, the server will emit a number of lifecycle events during the process. You can listen for these events, such as [`response.output_text.delta`](/docs/api-reference/realtime-server-events/response/output_text/delta), to provide realtime feedback to users as the response is generated. A full listing of the events emitted by there server are found below under **related server events**. They are provided in the rough order of when they are emitted, along with relevant client-side events for text generation.

||
|conversation.item.createresponse.create|conversation.item.addedconversation.item.doneresponse.createdresponse.output_item.addedresponse.content_part.addedresponse.output_text.deltaresponse.output_text.doneresponse.content_part.doneresponse.output_item.doneresponse.donerate_limits.updated|

## Audio inputs and outputs

One of the most powerful features of the Realtime API is voice-to-voice interaction with the model, without an intermediate text-to-speech or speech-to-text step. This enables lower latency for voice interfaces, and gives the model more data to work with around the tone and inflection of voice input.

### Voice options

Realtime sessions can be configured to use one of several built‑in voices when producing audio output. You can set the `voice` on session creation (or on a `response.create`) to control how the model sounds. Current voice options are `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, and `verse`. Once the model has emitted audio in a session, the `voice` cannot be modified for that session.

### Handling audio with WebRTC

If you are connecting to the Realtime API using WebRTC, the Realtime API is acting as a [peer connection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection) to your client. Audio output from the model is delivered to your client as a remote media stream. Audio input to the model is collected using audio devices ([`getUserMedia`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)), and media streams are added as tracks to to the peer connection.

The example code from the [WebRTC connection guide](/docs/guides/realtime-webrtc) shows a basic example of configuring both local and remote audio using browser APIs:

```javascript
// Create a peer connection
const pc = new RTCPeerConnection();

// Set up to play remote audio from the model
const audioEl = document.createElement("audio");
audioEl.autoplay = true;
pc.ontrack = (e) => (audioEl.srcObject = e.streams[0]);

// Add local audio track for microphone input in the browser
const ms = await navigator.mediaDevices.getUserMedia({
  audio: true,
});
pc.addTrack(ms.getTracks()[0]);
```

The snippet above enables simple interaction with the Realtime API, but there's much more that can be done. For more examples of different kinds of user interfaces, check out the [WebRTC samples](https://github.com/webrtc/samples) repository. Live demos of these samples can also be [found here](https://webrtc.github.io/samples/).

Using [media captures and streams](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API) in the browser enables you to do things like mute and unmute microphones, select which device to collect input from, and more.

### Client and server events for audio in WebRTC

By default, WebRTC clients don't need to send any client events to the Realtime API before sending audio inputs. Once a local audio track is added to the peer connection, your users can just start talking!

However, WebRTC clients still receive a number of server-sent lifecycle events as audio is moving back and forth between client and server over the peer connection. Examples include:

- When input is sent over the local media track, you will receive [`input_audio_buffer.speech_started`](/docs/api-reference/realtime-server-events/input_audio_buffer/speech_started) events from the server.
- When local audio input stops, you'll receive the [`input_audio_buffer.speech_stopped`](/docs/api-reference/realtime-server-events/input_audio_buffer/speech_started) event.
- You'll receive [delta events for the in-progress audio transcript](/docs/api-reference/realtime-server-events/response/output_audio_transcript/delta).
- You'll receive a [`response.done`](/docs/api-reference/realtime-server-events/response/done) event when the model has transcribed and completed sending a response.

Manipulating WebRTC APIs for media streams may give you all the control you need. However, it may occasionally be necessary to use lower-level interfaces for audio input and output. Refer to the WebSockets section below for more information and a listing of events required for granular audio input handling.

### Handling audio with WebSockets

When sending and receiving audio over a WebSocket, you will have a bit more work to do in order to send media from the client, and receive media from the server. Below, you'll find a table describing the flow of events during a WebSocket session that are necessary to send and receive audio over the WebSocket.

The events below are given in lifecycle order, though some events (like the `delta` events) may happen concurrently.

||
|Session initialization|session.update|session.createdsession.updated|
|User audio input|conversation.item.create  (send whole audio message)input_audio_buffer.append  (stream audio in chunks)input_audio_buffer.commit  (used when VAD is disabled)response.create  (used when VAD is disabled)|input_audio_buffer.speech_startedinput_audio_buffer.speech_stoppedinput_audio_buffer.committed|
|Server audio output|input_audio_buffer.clear  (used when VAD is disabled)|conversation.item.addedconversation.item.doneresponse.createdresponse.output_item.createdresponse.content_part.addedresponse.output_audio.deltaresponse.output_audio.doneresponse.output_audio_transcript.deltaresponse.output_audio_transcript.doneresponse.output_text.deltaresponse.output_text.doneresponse.content_part.doneresponse.output_item.doneresponse.donerate_limits.updated|

### Streaming audio input to the server

To stream audio input to the server, you can use the [`input_audio_buffer.append`](/docs/api-reference/realtime-client-events/input_audio_buffer/append) client event. This event requires you to send chunks of **Base64-encoded audio bytes** to the Realtime API over the socket. Each chunk cannot exceed 15 MB in size.

The format of the input chunks can be configured either for the entire session, or per response.

- Session: `session.input_audio_format` in [`session.update`](/docs/api-reference/realtime-client-events/session/update)
- Response: `response.input_audio_format` in [`response.create`](/docs/api-reference/realtime-client-events/response/create)

Append audio input bytes to the conversation

```javascript
import fs from 'fs';
import decodeAudio from 'audio-decode';

// Converts Float32Array of audio data to PCM16 ArrayBuffer
function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

// Converts a Float32Array to base64-encoded PCM16 data
base64EncodeAudio(float32Array) {
  const arrayBuffer = floatTo16BitPCM(float32Array);
  let binary = '';
  let bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000; // 32KB chunk size
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// Fills the audio buffer with the contents of three files,
// then asks the model to generate a response.
const files = [
  './path/to/sample1.wav',
  './path/to/sample2.wav',
  './path/to/sample3.wav'
];

for (const filename of files) {
  const audioFile = fs.readFileSync(filename);
  const audioBuffer = await decodeAudio(audioFile);
  const channelData = audioBuffer.getChannelData(0);
  const base64Chunk = base64EncodeAudio(channelData);
  ws.send(JSON.stringify({
    type: 'input_audio_buffer.append',
    audio: base64Chunk
  }));
});

ws.send(JSON.stringify({type: 'input_audio_buffer.commit'}));
ws.send(JSON.stringify({type: 'response.create'}));
```

```python
import base64
import json
import struct
import soundfile as sf
from websocket import create_connection

# ... create websocket-client named ws ...

def float_to_16bit_pcm(float32_array):
    clipped = [max(-1.0, min(1.0, x)) for x in float32_array]
    pcm16 = b''.join(struct.pack('<h', int(x * 32767)) for x in clipped)
    return pcm16

def base64_encode_audio(float32_array):
    pcm_bytes = float_to_16bit_pcm(float32_array)
    encoded = base64.b64encode(pcm_bytes).decode('ascii')
    return encoded

files = [
    './path/to/sample1.wav',
    './path/to/sample2.wav',
    './path/to/sample3.wav'
]

for filename in files:
    data, samplerate = sf.read(filename, dtype='float32')
    channel_data = data[:, 0] if data.ndim > 1 else data
    base64_chunk = base64_encode_audio(channel_data)

    # Send the client event
    event = {
        "type": "input_audio_buffer.append",
        "audio": base64_chunk
    }
    ws.send(json.dumps(event))
```

### Send full audio messages

It is also possible to create conversation messages that are full audio recordings. Use the [`conversation.item.create`](/docs/api-reference/realtime-client-events/conversation/item/create) client event to create messages with `input_audio` content.

Create full audio input conversation items

```javascript
const fullAudio = "<a base64-encoded string of audio bytes>";

const event = {
  type: "conversation.item.create",
  item: {
    type: "message",
    role: "user",
    content: [
      {
        type: "input_audio",
        audio: fullAudio,
      },
    ],
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
```

```python
fullAudio = "<a base64-encoded string of audio bytes>"

event = {
    "type": "conversation.item.create",
    "item": {
        "type": "message",
        "role": "user",
        "content": [
            {
                "type": "input_audio",
                "audio": fullAudio,
            }
        ],
    },
}

ws.send(json.dumps(event))
```

### Working with audio output from a WebSocket

**To play output audio back on a client device like a web browser, we recommend using WebRTC rather than WebSockets**. WebRTC will be more robust sending media to client devices over uncertain network conditions.

But to work with audio output in server-to-server applications using a WebSocket, you will need to listen for [`response.output_audio.delta`](/docs/api-reference/realtime-server-events/response/output_audio/delta) events containing the Base64-encoded chunks of audio data from the model. You will either need to buffer these chunks and write them out to a file, or maybe immediately stream them to another source like [a phone call with Twilio](https://www.twilio.com/en-us/blog/twilio-openai-realtime-api-launch-integration).

Note that the [`response.output_audio.done`](/docs/api-reference/realtime-server-events/response/output_audio/done) and [`response.done`](/docs/api-reference/realtime-server-events/response/done) events won't actually contain audio data in them - just audio content transcriptions. To get the actual bytes, you'll need to listen for the [`response.output_audio.delta`](/docs/api-reference/realtime-server-events/response/output_audio/delta) events.

The format of the output chunks can be configured either for the entire session, or per response.

- Session: `session.audio.output.format` in [`session.update`](/docs/api-reference/realtime-client-events/session/update)
- Response: `response.audio.output.format` in [`response.create`](/docs/api-reference/realtime-client-events/response/create)

Listen for response.output_audio.delta events

```javascript
function handleEvent(e) {
  const serverEvent = JSON.parse(e.data);
  if (serverEvent.type === "response.audio.delta") {
    // Access Base64-encoded audio chunks
    // console.log(serverEvent.delta);
  }
}

// Listen for server messages (WebSocket)
ws.on("message", handleEvent);
```

```python
def on_message(ws, message):
    server_event = json.loads(message)
    if server_event.type == "response.audio.delta":
        # Access Base64-encoded audio chunks:
        # print(server_event.delta)
```

## Voice activity detection

By default, Realtime sessions have **voice activity detection (VAD)** enabled, which means the API will determine when the user has started or stopped speaking and respond automatically.

Read more about how to configure VAD in our [voice activity detection](/docs/guides/realtime-vad) guide.

### Disable VAD

VAD can be disabled by setting `turn_detection` to `null` with the [`session.update`](/docs/api-reference/realtime-client-events/session/update) client event. This can be useful for interfaces where you would like to take granular control over audio input, like [push to talk](https://en.wikipedia.org/wiki/Push-to-talk) interfaces.

When VAD is disabled, the client will have to manually emit some additional client events to trigger audio responses:

- Manually send [`input_audio_buffer.commit`](/docs/api-reference/realtime-client-events/input_audio_buffer/commit), which will create a new user input item for the conversation.
- Manually send [`response.create`](/docs/api-reference/realtime-client-events/response/create) to trigger an audio response from the model.
- Send [`input_audio_buffer.clear`](/docs/api-reference/realtime-client-events/input_audio_buffer/clear) before beginning a new user input.

### Keep VAD, but disable automatic responses

If you would like to keep VAD mode enabled, but would just like to retain the ability to manually decide when a response is generated, you can set `turn_detection.interrupt_response` and `turn_detection.create_response` to `false` with the [`session.update`](/docs/api-reference/realtime-client-events/session/update) client event. This will retain all the behavior of VAD but not automatically create new Responses. Clients can trigger these manually with a [`response.create`](/docs/api-reference/realtime-client-events/response/create) event.

This can be useful for moderation or input validation or RAG patterns, where you're comfortable trading a bit more latency in the interaction for control over inputs.

## Create responses outside the default conversation

By default, all responses generated during a session are added to the session's conversation state (the "default conversation"). However, you may want to generate model responses outside the context of the session's default conversation, or have multiple responses generated concurrently. You might also want to have more granular control over which conversation items are considered while the model generates a response (e.g. only the last N number of turns).

Generating "out-of-band" responses which are not added to the default conversation state is possible by setting the `response.conversation` field to the string `none` when creating a response with the [`response.create`](/docs/api-reference/realtime-client-events/response/create) client event.

When creating an out-of-band response, you will probably also want some way to identify which server-sent events pertain to this response. You can provide `metadata` for your model response that will help you identify which response is being generated for this client-sent event.

Create an out-of-band model response

```javascript
const prompt = `
Analyze the conversation so far. If it is related to support, output
"support". If it is related to sales, output "sales".
`;

const event = {
  type: "response.create",
  response: {
    // Setting to "none" indicates the response is out of band
    // and will not be added to the default conversation
    conversation: "none",

    // Set metadata to help identify responses sent back from the model
    metadata: { topic: "classification" },

    // Set any other available response fields
    output_modalities: ["text"],
    instructions: prompt,
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
```

```python
prompt = """
Analyze the conversation so far. If it is related to support, output
"support". If it is related to sales, output "sales".
"""

event = {
    "type": "response.create",
    "response": {
        # Setting to "none" indicates the response is out of band,
        # and will not be added to the default conversation
        "conversation": "none",

        # Set metadata to help identify responses sent back from the model
        "metadata": { "topic": "classification" },

        # Set any other available response fields
        "output_modalities": [ "text" ],
        "instructions": prompt,
    },
}

ws.send(json.dumps(event))
```

Now, when you listen for the [`response.done`](/docs/api-reference/realtime-server-events/response/done) server event, you can identify the result of your out-of-band response.

Create an out-of-band model response

```javascript
function handleEvent(e) {
  const serverEvent = JSON.parse(e.data);
  if (serverEvent.type === "response.done" && serverEvent.response.metadata?.topic === "classification") {
    // this server event pertained to our OOB model response
    console.log(serverEvent.response.output[0]);
  }
}

// Listen for server messages (WebRTC)
dataChannel.addEventListener("message", handleEvent);

// Listen for server messages (WebSocket)
// ws.on("message", handleEvent);
```

```python
def on_message(ws, message):
    server_event = json.loads(message)
    topic = ""

    # See if metadata is present
    try:
        topic = server_event.response.metadata.topic
    except AttributeError:
        print("topic not set")

    if server_event.type == "response.done" and topic == "classification":
        # this server event pertained to our OOB model response
        print(server_event.response.output[0])
```

### Create a custom context for responses

You can also construct a custom context that the model will use to generate a response, outside the default/current conversation. This can be done using the `input` array on a [`response.create`](/docs/api-reference/realtime-client-events/response/create) client event. You can use new inputs, or reference existing input items in the conversation by ID.

Listen for out-of-band model response with custom context

```javascript
const event = {
  type: "response.create",
  response: {
    conversation: "none",
    metadata: { topic: "pizza" },
    output_modalities: ["text"],

    // Create a custom input array for this request with whatever context
    // is appropriate
    input: [
      // potentially include existing conversation items:
      {
        type: "item_reference",
        id: "some_conversation_item_id",
      },
      {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Is it okay to put pineapple on pizza?",
          },
        ],
      },
    ],
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
```

```python
event = {
    "type": "response.create",
    "response": {
        "conversation": "none",
        "metadata": { "topic": "pizza" },
        "output_modalities": [ "text" ],

        # Create a custom input array for this request with whatever
        # context is appropriate
        "input": [
            # potentially include existing conversation items:
            {
                "type": "item_reference",
                "id": "some_conversation_item_id"
            },

            # include new content as well
            {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "Is it okay to put pineapple on pizza?",
                    }
                ],
            }
        ],
    },
}

ws.send(json.dumps(event))
```

### Create responses with no context

You can also insert responses into the default conversation, ignoring all other instructions and context. Do this by setting `input` to an empty array.

Insert no-context model responses into the default conversation

```javascript
const prompt = `
Say exactly the following:
I'm a little teapot, short and stout!
This is my handle, this is my spout!
`;

const event = {
  type: "response.create",
  response: {
    // An empty input array removes existing context
    input: [],
    instructions: prompt,
  },
};

// WebRTC data channel and WebSocket both have .send()
dataChannel.send(JSON.stringify(event));
```

```python
prompt = """
Say exactly the following:
I'm a little teapot, short and stout!
This is my handle, this is my spout!
"""

event = {
    "type": "response.create",
    "response": {
        # An empty input array removes all prior context
        "input": [],
        "instructions": prompt,
    },
}

ws.send(json.dumps(event))
```

## Function calling

The Realtime models also support **function calling**, which enables you to execute custom code to extend the capabilities of the model. Here's how it works at a high level:

1.  When [updating the session](/docs/api-reference/realtime-client-events/session/update) or [creating a response](/docs/api-reference/realtime-client-events/response/create), you can specify a list of available functions for the model to call.
2.  If when processing input, the model determines it should make a function call, it will add items to the conversation representing arguments to a function call.
3.  When the client detects conversation items that contain function call arguments, it will execute custom code using those arguments
4.  When the custom code has been executed, the client will create new conversation items that contain the output of the function call, and ask the model to respond.

Let's see how this would work in practice by adding a callable function that will provide today's horoscope to users of the model. We'll show the shape of the client event objects that need to be sent, and what the server will emit in turn.

### Configure callable functions

First, we must give the model a selection of functions it can call based on user input. Available functions can be configured either at the session level, or the individual response level.

- Session: `session.tools` property in [`session.update`](/docs/api-reference/realtime-client-events/session/update)
- Response: `response.tools` property in [`response.create`](/docs/api-reference/realtime-client-events/response/create)

Here's an example client event payload for a `session.update` that configures a horoscope generation function, that takes a single argument (the astrological sign for which the horoscope should be generated):

[`session.update`](/docs/api-reference/realtime-client-events/session/update)

```json
{
  "type": "session.update",
  "session": {
    "tools": [
      {
        "type": "function",
        "name": "generate_horoscope",
        "description": "Give today's horoscope for an astrological sign.",
        "parameters": {
          "type": "object",
          "properties": {
            "sign": {
              "type": "string",
              "description": "The sign for the horoscope.",
              "enum": ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]
            }
          },
          "required": ["sign"]
        }
      }
    ],
    "tool_choice": "auto"
  }
}
```

The `description` fields for the function and the parameters help the model choose whether or not to call the function, and what data to include in each parameter. If the model receives input that indicates the user wants their horoscope, it will call this function with a `sign` parameter.

### Detect when the model wants to call a function

Based on inputs to the model, the model may decide to call a function in order to generate the best response. Let's say our application adds the following conversation item and attempts to generate a response:

[`conversation.item.create`](/docs/api-reference/realtime-client-events/conversation/item/create)

```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "What is my horoscope? I am an aquarius."
      }
    ]
  }
}
```

Followed by a client event to generate a response:

[`response.create`](/docs/api-reference/realtime-client-events/response/create)

```json
{
  "type": "response.create"
}
```

Instead of immediately returning a text or audio response, the model will instead generate a response that contains the arguments that should be passed to a function in the developer's application. You can listen for realtime updates to function call arguments using the [`response.function_call_arguments.delta`](/docs/api-reference/realtime-server-events/response/function_call_arguments/delta) server event, but `response.done` will also have the complete data we need to call our function.

[`response.done`](/docs/api-reference/realtime-server-events/response/done)

```json
{
  "type": "response.done",
  "event_id": "event_AeqLA8iR6FK20L4XZs2P6",
  "response": {
    "object": "realtime.response",
    "id": "resp_AeqL8XwMUOri9OhcQJIu9",
    "status": "completed",
    "status_details": null,
    "output": [
      {
        "object": "realtime.item",
        "id": "item_AeqL8gmRWDn9bIsUM2T35",
        "type": "function_call",
        "status": "completed",
        "name": "generate_horoscope",
        "call_id": "call_sHlR7iaFwQ2YQOqm",
        "arguments": "{\"sign\":\"Aquarius\"}"
      }
    ],
    "usage": {
      "total_tokens": 541,
      "input_tokens": 521,
      "output_tokens": 20,
      "input_token_details": {
        "text_tokens": 292,
        "audio_tokens": 229,
        "cached_tokens": 0,
        "cached_tokens_details": { "text_tokens": 0, "audio_tokens": 0 }
      },
      "output_token_details": {
        "text_tokens": 20,
        "audio_tokens": 0
      }
    },
    "metadata": null
  }
}
```

In the JSON emitted by the server, we can detect that the model wants to call a custom function:

| Property                     | Function calling purpose                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| response.output[0].type      | When set to function_call, indicates this response contains arguments for a named function call.                       |
| response.output[0].name      | The name of the configured function to call, in this case generate_horoscope                                           |
| response.output[0].arguments | A JSON string containing arguments to the function. In our case, "{\"sign\":\"Aquarius\"}".                            |
| response.output[0].call_id   | A system-generated ID for this function call - you will need this ID to pass a function call result back to the model. |

Given this information, we can execute code in our application to generate the horoscope, and then provide that information back to the model so it can generate a response.

### Provide the results of a function call to the model

Upon receiving a response from the model with arguments to a function call, your application can execute code that satisfies the function call. This could be anything you want, like talking to external APIs or accessing databases.

Once you are ready to give the model the results of your custom code, you can create a new conversation item containing the result via the `conversation.item.create` client event.

[`conversation.item.create`](/docs/api-reference/realtime-client-events/conversation/item/create)

```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "function_call_output",
    "call_id": "call_sHlR7iaFwQ2YQOqm",
    "output": "{\"horoscope\": \"You will soon meet a new friend.\"}"
  }
}
```

- The conversation item type is `function_call_output`
- `item.call_id` is the same ID we got back in the `response.done` event above
- `item.output` is a JSON string containing the results of our function call

Once we have added the conversation item containing our function call results, we again emit the `response.create` event from the client. This will trigger a model response using the data from the function call.

[`response.create`](/docs/api-reference/realtime-client-events/response/create)

```json
{
  "type": "response.create"
}
```

## Error handling

The [`error`](/docs/api-reference/realtime-server-events/error) event is emitted by the server whenever an error condition is encountered on the server during the session. Occasionally, these errors can be traced to a client event that was emitted by your application.

Unlike HTTP requests and responses, where a response is implicitly tied to a request from the client, we need to use an `event_id` property on client events to know when one of them has triggered an error condition on the server. This technique is shown in the code below, where the client attempts to emit an unsupported event type.

```javascript
const event = {
  event_id: "my_awesome_event",
  type: "scooby.dooby.doo",
};

dataChannel.send(JSON.stringify(event));
```

This unsuccessful event sent from the client will emit an error event like the following:

```json
{
  "type": "invalid_request_error",
  "code": "invalid_value",
  "message": "Invalid value: 'scooby.dooby.doo' ...",
  "param": "type",
  "event_id": "my_awesome_event"
}
```

Was this page useful?
