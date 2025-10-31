---
applyTo: "./server.js"
---

# OpenAI

## Text Gen

INPUT

```ts
import OpenAI from "openai";

const openai = new OpenAI();

const response = await openai.responses.create({
  model: "gpt-5-mini",
  input: "Tell me a three sentence bedtime story about a unicorn.",
  reasoning: { effort: "minimal" },
  text: { verbosity: "low" },
});

console.log(response);
```

OUTPUT

```json
{
  "id": "resp_68b37ac16df4819487da2cd4496c12cb090dedc946b4e6f2",
  "object": "response",
  "created_at": 1756592833,
  "status": "completed",
  "background": false,
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "max_tool_calls": null,
  "model": "gpt-5-mini-2025-08-07",
  "output": [
    {
      "id": "rs_68b37ac2ebf08194a46a57ec65e9b587090dedc946b4e6f2",
      "type": "reasoning",
      "summary": []
    },
    {
      "id": "msg_68b37ac4d164819497dbf8d19990f05b090dedc946b4e6f2",
      "type": "message",
      "status": "completed",
      "content": [
        {
          "type": "output_text",
          "annotations": [],
          "logprobs": [],
          "text": "Once upon a time..."
        }
      ],
      "role": "assistant"
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "prompt_cache_key": null,
  "reasoning": {
    "effort": "medium",
    "summary": null
  },
  "safety_identifier": null,
  "service_tier": "default",
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "tool_choice": "auto",
  "tools": [],
  "top_logprobs": 0,
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 83,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 169,
    "output_tokens_details": {
      "reasoning_tokens": 128
    },
    "total_tokens": 252
  },
  "user": null,
  "metadata": {}
}
```

## Image input

```ts
import OpenAI from "openai";

const openai = new OpenAI();

const response = await openai.responses.create({
  model: "gpt-5-mini",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Describe this image in a short caption." },
        { type: "input_image", image_url: src, detail: "auto" },
      ],
    },
  ],
});

console.log(response);
```

OUTPUT

```json
{
  "id": "resp_68b37ac16df4819487da2cd4496c12cb090dedc946b4e6f2",
  "object": "response",
  "created_at": 1756592833,
  "status": "completed",
  "background": false,
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "max_tool_calls": null,
  "model": "gpt-5-mini-2025-08-07",
  "output": [
    {
      "id": "rs_68b37ac2ebf08194a46a57ec65e9b587090dedc946b4e6f2",
      "type": "reasoning",
      "summary": []
    },
    {
      "id": "msg_68b37ac4d164819497dbf8d19990f05b090dedc946b4e6f2",
      "type": "message",
      "status": "completed",
      "content": [
        {
          "type": "output_text",
          "annotations": [],
          "logprobs": [],
          "text": "Code snippet showing a JavaScript object with role \"user\" and a content array containing \"input_text\" and \"input_image\", followed by extracting outputItem from a response."
        }
      ],
      "role": "assistant"
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "prompt_cache_key": null,
  "reasoning": {
    "effort": "medium",
    "summary": null
  },
  "safety_identifier": null,
  "service_tier": "default",
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": "medium"
  },
  "tool_choice": "auto",
  "tools": [],
  "top_logprobs": 0,
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 83,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 169,
    "output_tokens_details": {
      "reasoning_tokens": 128
    },
    "total_tokens": 252
  },
  "user": null,
  "metadata": {}
}
```

## Structed JSON output

Make sure to use gpt-5 family models.
Do NOT set temperature.
Do set reasoning effort and vervosity.

```ts
import { OpenAI } from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  dangerouslyAllowBrowser: true,
  apiKey: "your-api-key-here",
});

// Example API call for structured JSON output
(async () => {
  const prompt = `
Analyze this product image and generate conceptual and material properties.

Respond in this JSON format:
{
  "properties": [
    {
      "name": "string",
      "lowEnd": "string",
      "highEnd": "string"
    }
  ]
}
  `.trim();

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: "https://example.com/image.jpg", detail: "auto" },
        ],
      },
    ],
    reasoning: { effort: "minimal" },
    text: { verbosity: "low", format: { type: "json_object" } },
    stream: false, // Set to false for non-streaming to get full response
  });

  // Basic response structure (non-streaming)
  console.log(response);
})();
```

```txt
{
  "id": "resp_1234567890",
  "object": "response",
  "created": 1727100000,
  "model": "gpt-5-mini",
  "output": [
    {
      "type": "text",
      "text": {
        "value": "{\"properties\": [{\"name\": \"Material Texture\", \"lowEnd\": \"Smooth\", \"highEnd\": \"Rough\"}]}",
        "annotations": []
      }
    }
  ],
  "usage": {
    "input_tokens": 150,
    "output_tokens": 50
  }
}
```
