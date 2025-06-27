import { streamText, tool, generateText } from "ai"
import { z } from 'zod';
import dotenv from 'dotenv'
import { Valyu } from 'valyu-js';
import { anthropic } from "@ai-sdk/anthropic"
import readline from 'readline';

// Load environment variables
dotenv.config()

// Initialize Valyu client
const valyu = new Valyu(process.env.VALYU_API_KEY);

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const valyuBusinessSearchTool = tool({
    description: 'Search the authoritative Wiley business, accounting, and finance academic corpus for specific information. Use this tool when you need current, detailed, or authoritative information about business management, accounting principles, HR policies, corporate governance, or related academic topics. This tool provides access to peer-reviewed research, textbooks, and professional publications.',
    parameters: z.object({
      query: z.string().describe('Specific, detailed search query focusing on the exact information needed - be precise about the topic, concepts, or questions you want answered'),
      maxResults: z.number().min(1).max(20).default(5).describe('Maximum number of results to return'),
    }),
    execute: async ({ query, maxResults }) => {
      try {
        const response = await valyu.search(query, {
          searchType: 'proprietary',
          maxNumResults: maxResults,
          includedSources: [
            'wiley/wiley-finance-books',
            'wiley/wiley-finance-papers'
          ],
          isToolCall: true,
        });

        if (!response.success) {
          return JSON.stringify({
            success: false,
            error: response.error || 'Search failed',
            results: []
          });
        }
        
        const formattedResults = response.results?.map((result, index) => ({
          title: result.title || 'Untitled Source',
          content: result.content,
          url: result.url,
          source: result.source,
          relevanceScore: result.relevance_score,
          citation: `[${result.title || 'Untitled Source'}]${result.url ? `(${result.url})` : ''}`
        })) || [];

        const resultText = formattedResults.map((result, idx) => 
          `SOURCE ${idx + 1}: ${result.title}
CONTENT: ${result.content?.substring(0, 800)}...
CITATION: ${result.citation}

`).join('\n');

        return resultText;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        return JSON.stringify({
          success: false,
          error: errorMessage,
          results: []
        });
      }
    },
});

// Store conversation history
let conversationHistory = [];

async function processUserInput(userInput) {
  // Add user message to history
  conversationHistory.push({
    role: 'user',
    content: userInput
  });

  const result = await streamText({
    model: anthropic('claude-3-5-sonnet-latest'),
    system: `You are an AI business research assistant with access to authoritative Wiley sources.

SEARCH GUIDELINES:
1. **When to search**: Use the search tool for questions about:
   - Business management, accounting principles, HR policies, corporate governance
   - Industry concepts, theories, best practices
   - Procedures, regulations, or methodologies
   - Current industry standards or research findings

2. **When NOT to search**: Only skip searching for:
   - Simple clarifications about our conversation
   - Basic follow-up questions that can be answered from previous search results
   - General conversational responses

3. **Always use well-cited, authoritative sources**: 
   - Don't rely on general knowledge for substantive answers
   - If you haven't searched for information, clearly state that you should search first
   - Always include proper citations [Source Title](URL) when using search results

4. **Response style**:
   - Include multiple citations to support your points
   - Be clear and well-sourced in your responses

Your value comes from accessing well-cited, authoritative Wiley sources.`,
    messages: conversationHistory,
    tools: {valyuBusinessSearchTool},
    maxSteps: 5
  })

  let assistantResponse = '';

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        // AI Response
        process.stdout.write(`\x1b[36m${part.textDelta}\x1b[0m`);
        assistantResponse += part.textDelta;
        break;
      case 'tool-call':
        console.log(`\n\n\x1b[33m🔧 TOOL CALL: Searching Wiley corpus for "${part.args.query}"\x1b[0m\n`);
        console.log('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
        break;
      case 'tool-result':
        console.log(`\n\x1b[32m📊 TOOL RESULT:\x1b[0m`);
        // Parse the tool result to show clean source information
        try {
          const resultText = part.result;
          if (resultText.includes('SOURCE 1:')) {
            console.log(`\x1b[32m📚 Found sources:\x1b[0m`);
            // Extract and display sources cleanly
            const sources = resultText.match(/SOURCE \d+: ([^\n]+)/g);
            const citations = resultText.match(/CITATION: \[([^\]]+)\]\(([^)]+)\)/g);
            
            if (sources && citations) {
              sources.forEach((source, idx) => {
                const title = source.replace(/SOURCE \d+: /, '');
                const citation = citations[idx];
                if (citation) {
                  const urlMatch = citation.match(/\(([^)]+)\)/);
                  const url = urlMatch ? urlMatch[1] : '';
                  console.log(`\x1b[32m   ${idx + 1}. ${title}\x1b[0m`);
                  console.log(`\x1b[90m      ${url}\x1b[0m`);
                }
              });
            }
          }
        } catch (e) {
          // If parsing fails, just continue
        }
        console.log('\x1b[90m' + '─'.repeat(80) + '\x1b[0m');
        console.log(`\n\x1b[36m🤖 AI RESPONSE:\x1b[0m`);
        break;
    }
  }

  // Add assistant response to history
  conversationHistory.push({
    role: 'assistant',
    content: assistantResponse
  });

  console.log('\n');
}

function askQuestion() {
  return new Promise((resolve) => {
    rl.question('\x1b[35m💬 You: \x1b[0m', (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('\x1b[1m\x1b[34m🎯 Welcome to the Valyu Business AI Assistant!\x1b[0m');
  console.log('\x1b[90mI have access to Wiley\'s authoritative business, accounting, and finance corpus.\x1b[0m');
  console.log('\x1b[90mAsk me about: HR policies, accounting principles, business strategy, leadership, etc.\x1b[0m');
  console.log('\x1b[90mI\'ll search for authoritative sources to give you well-researched, cited answers.\x1b[0m');
  console.log('\x1b[90mType "exit" or "quit" to end the conversation.\x1b[0m\n');

  while (true) {
    try {
      const userInput = await askQuestion();
      
      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit' || userInput === '') {
        console.log('\x1b[34m👋 Thanks for using the Valyu Business AI Assistant!\x1b[0m');
        break;
      }

      await processUserInput(userInput);
      
    } catch (error) {
      console.error('\x1b[31m❌ Error occurred:\x1b[0m', error);
    }
  }

  rl.close();
}

// Run the main function and handle errors
main().catch(console.error);