# Suspicious Email Triage Assistant

## Overview
Security teams regularly review emails reported by employees as suspicious. 
Most are harmless, some require investigation, and a few should be escalated immediately. 
Build a small application that helps an analyst triage a reported email, review the reasoning behind the result, and record a final decision.

## Goal
Build a full-stack application that allows an analyst to:

- submit a suspicious email for review
- attach optional reference material, such as trusted domains, internal guidance, or analyst notes
- trigger automated analysis
- inspect a structured result with verdict, findings, and evidence
- override the final outcome with a reason

Focus on a clean, working implementation of the core flow over breadth.

## Functional Requirements
### 1. Create a review
Provide a UI and API for creating an email review.

Each review should include:

- sender name
- sender email address
- subject
- body
- optional extracted links
- optional reference material, such as pasted text, markdown/text files, or public URLs

Persist reviews and analysis results in a database.

### 2. Run analysis asynchronously
Run the analysis outside the main request/response cycle. Use a worker, queue, background job, or separate service.

Expose a review status such as:

- `pending`
- `processing`
- `completed`
- `failed`

### 3. Present the result
Each completed review should include:

- `verdict`: `benign`, `suspicious`, or `likely_phishing`
- `recommendedAction`: `close`, `investigate`, or `report_and_block`
- a short analyst-facing summary
- 2-5 findings, each with a severity and short explanation
- evidence snippets or references showing why each finding exists
- 1-3 follow-up questions when confidence is low or information is missing

### 4. Include AI-assisted analysis
Use an LLM for at least one meaningful part of the workflow, such as:

- summarization
- finding extraction
- verdict drafting
- follow-up question generation

If the email content and reference material are short, it is acceptable to send them directly to the model. 
If they are longer, narrow the context first by selecting the most relevant sections. 
Keep the output grounded in the supplied material.

### 5. Apply deterministic rules
Incorporate the following rules into the final result:

- If the email asks for a password, MFA code, or payment details and includes either a link or a request to reply, the verdict cannot be `benign`.
- If the email uses urgent language and asks the recipient to click a link, open an attachment, or provide credentials, the verdict cannot be `benign`.
- If a link domain does not match the sender's domain, include at least one finding about the mismatch.
- If a trusted domains list is provided and neither the sender domain nor the linked domains appear in it, include at least one finding about that mismatch.
- If there is too little information to make a confident decision, `recommendedAction` should be `investigate` and the result should include at least one follow-up question.

You may add additional rules if they improve the result, as long as the logic remains clear and explainable.

### 6. Support manual override
Allow an analyst to override the final verdict or recommended action and save a reason. Preserve both the original system result and the manual override.

### 7. Provide a review list
Provide a list view for multiple reviews that makes it easy to scan:

- current status
- verdict
- recommended action
- last updated time

## Example Input
```json
{
  "senderName": "Microsoft Support",
  "senderEmail": "security-update@micr0soft-login-help.com",
  "subject": "Your account will be disabled today",
  "body": "Your Microsoft 365 password expires today. Click the secure link below to keep access to your mailbox. Failure to respond within 30 minutes will result in suspension.",
  "links": [
    "https://microsoft-login-help.example/reset"
  ],
  "referenceSources": [
    {
      "type": "text",
      "title": "Trusted Domains",
      "content": "microsoft.com\noffice.com\ncompany.com"
    },
    {
      "type": "text",
      "title": "Security Guidance",
      "content": "Messages asking for passwords, MFA codes, or urgent login actions should be reviewed carefully."
    }
  ]
}
```

## Technical Requirements
- Implement the backend, API layer, and related infrastructure in Node.js.
- Build the frontend in React.
- Use a database. The choice of database is up to you.
- Make the project runnable locally with one documented command, preferably `docker compose up`.
- Keep a clear separation between the API layer and the analysis process.
- AI coding tools may be used.
- A paid model, API key, or subscription is not required. A local setup is acceptable if the integration points are clear; for example, Ollama with a small local model is a reasonable option.
- If you use retrieval, a simple approach is sufficient. Keyword search or in-memory matching is acceptable; embeddings, vector stores, and hybrid retrieval are optional extensions.
- Beyond these requirements, use any model provider, libraries, and supporting tools you prefer.

## Out of Scope
The following are not required:

- authentication and authorization
- real mailbox integration
- cloud deployment

## Deliverables
Please include:

- source code
- a `README.md` with setup and run instructions
- a brief architecture note in the `README.md`
- one or more sample fixtures so the core flow is easy to review

## Evaluation Criteria
Submissions will be evaluated based on:

- completeness and correctness of the core flow
- code clarity, structure, and maintainability
- API and data model design
- separation of concerns between UI, API, and background processing
- quality and grounding of the AI-assisted workflow
- documentation and ease of local setup

## Optional Extensions
If you would like to go further, you may also add:

- a polished, user-friendly UI
- tests for key logic
- progress updates streamed to the UI
- retry handling for failed background jobs
- support for more than one model/provider behind a small abstraction layer
- extraction of indicators such as domains, URLs, or suspicious phrases
- analyst notes or collaboration comments on a review
- safeguards against prompt injection or malformed source content

## Submission
Please share:

- a repository link
- clear instructions for running the project locally
- anything the reviewer should know to evaluate the project efficiently
