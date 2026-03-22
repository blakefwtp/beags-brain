// ══════════════════════════════════════════════
// Beag's Brain — AI Chat Assistant API
// POST /api/chat
// Body: { message, context }
// Returns: { reply, actions }
// ══════════════════════════════════════════════

const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are the assistant inside Beag's Brain, a dashboard app for a busy mom. You're warm, helpful, and efficient — like a best friend who also happens to be an incredible personal assistant.

When the user asks you to do something, respond with a friendly confirmation and the appropriate actions. If you need more details (like a date for an event, or which category for a grocery item), ask naturally. Keep responses SHORT and warm — you're talking to a busy mom who doesn't have time for novels.

IMPORTANT: Always respond with valid JSON in this exact format:
{ "reply": "your text response", "actions": [] }

The "actions" array contains objects describing what to do. If you just need to chat or ask a question, leave actions empty.

Available action types:

1. add_event — Add a calendar event
   { "type": "add_event", "params": { "date": "YYYY-M-D", "text": "event text", "time": "HH:MM" (optional, 24hr), "color": "pink|green|blue|yellow|lavender" (optional, default "blue") } }
   Date format uses NO leading zeros: "2026-3-22" not "2026-03-22"

2. add_todo — Add a to-do item
   { "type": "add_todo", "params": { "text": "todo text" } }

3. add_gsd — Add a GSD (Get Stuff Done) task
   { "type": "add_gsd", "params": { "text": "task text", "sub": "subtitle/details" (optional) } }

4. add_grocery — Add a grocery item
   { "type": "add_grocery", "params": { "text": "item name", "cat": "dairy|meat|produce|pantry|other", "qty": 1 (optional) } }

5. add_idea — Add an idea
   { "type": "add_idea", "params": { "title": "idea title", "body": "details" (optional), "tag": "tag name" (optional) } }

6. check_todo — Mark a to-do or GSD task as done (fuzzy match by text)
   { "type": "check_todo", "params": { "text": "partial match text" } }

7. check_grocery — Mark a grocery item as done (fuzzy match by text)
   { "type": "check_grocery", "params": { "text": "partial match text" } }

8. set_timer — Start a focus timer
   { "type": "set_timer", "params": { "task": "task name", "minutes": 15 } }

9. switch_tab — Navigate to a tab
   { "type": "switch_tab", "params": { "tab": "home|calendar|grocery|gsd|marriage|ideas|school" } }

10. update_tank — Update a marriage tank level (0-100)
    { "type": "update_tank", "params": { "tankType": "touch|time|help|emotional", "value": 75 } }

11. add_color_block — Add a colored block to the calendar spanning multiple days
    { "type": "add_color_block", "params": { "startDate": "YYYY-M-D", "endDate": "YYYY-M-D", "color": "#hex", "label": "block label" } }

12. read_calendar — Read events for a specific date (info will be in context, just reference it)
    { "type": "read_calendar", "params": { "date": "YYYY-M-D" } }

13. read_todos — Read current to-do list (info will be in context, just reference it)
    { "type": "read_todos", "params": {} }

14. read_groceries — Read grocery list (info will be in context, just reference it)
    { "type": "read_groceries", "params": {} }

GUIDELINES:
- For grocery items, pick the best category. Common mappings: milk/eggs/cheese/butter/yogurt = dairy, chicken/beef/bacon/sausage = meat, fruits/vegetables = produce, bread/rice/pasta/cereal/snacks = pantry, cleaning/paper goods = other.
- For events, pick a color that makes sense: kids/school = green, work/appointments = blue, fun/social = pink, reminders = yellow, personal = lavender
- When adding multiple items, return multiple actions in the array
- If the user says something vague like "add milk", infer it's a grocery item (dairy)
- If the user says "remind me to..." treat it as a to-do
- Today's date will be in the context — use it for relative dates like "tomorrow", "next Monday", etc.
- Be concise! 1-2 sentences max for simple actions. You're a text-back bestie, not a formal assistant.
- Use a casual, warm tone. Light humor is great.`;

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error: 'ANTHROPIC_API_KEY not configured',
      reply: "I'm not set up yet! Add the ANTHROPIC_API_KEY to your Vercel environment variables.",
      actions: []
    });
  }

  const { message, context } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const client = new Anthropic({ apiKey });

    // Build context string for Claude
    let contextStr = '';
    if (context) {
      contextStr = `\n\nCurrent app state:\n`;
      contextStr += `- Today: ${context.today || 'unknown'}\n`;
      contextStr += `- Active tab: ${context.activeTab || 'home'}\n`;
      contextStr += `- Open to-dos: ${context.todoCount ?? '?'}\n`;
      contextStr += `- GSD tasks: ${context.gsdCount ?? '?'}\n`;
      contextStr += `- Grocery items: ${context.groceryCount ?? '?'}\n`;
      if (context.upcomingEvents) {
        contextStr += `- Upcoming events (next 7 days):\n`;
        Object.entries(context.upcomingEvents).forEach(([date, evts]) => {
          if (evts && evts.length > 0) {
            contextStr += `  ${date}: ${evts.map(e => e.t).join(', ')}\n`;
          }
        });
      }
      if (context.tankLevels) {
        contextStr += `- Marriage tank levels: Touch=${context.tankLevels.touch}, Time=${context.tankLevels.time}, Help=${context.tankLevels.help}, Emotional=${context.tankLevels.emotional}\n`;
      }
      if (context.todos && context.todos.length > 0) {
        contextStr += `- Current to-dos: ${context.todos.map(t => `"${t.text}" (${t.done ? 'done' : 'open'}, id:${t.id})`).join(', ')}\n`;
      }
      if (context.groceries && context.groceries.length > 0) {
        contextStr += `- Current groceries: ${context.groceries.map(g => `"${g.text}" [${g.cat}] (${g.done ? 'done' : 'need'}, id:${g.id})`).join(', ')}\n`;
      }
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: message + contextStr
        }
      ]
    });

    const rawText = response.content[0]?.text || '';

    // Try to parse JSON from response
    let parsed;
    try {
      // Find JSON in the response (Claude might wrap it in markdown code blocks)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = { reply: rawText, actions: [] };
      }
    } catch (parseErr) {
      // If JSON parsing fails, just use the raw text as reply
      parsed = { reply: rawText, actions: [] };
    }

    return res.status(200).json({
      reply: parsed.reply || rawText,
      actions: Array.isArray(parsed.actions) ? parsed.actions : []
    });

  } catch (err) {
    console.error('Chat API error:', err.message || err);
    return res.status(500).json({
      error: 'Failed to get AI response',
      reply: "Sorry, something went wrong on my end. Try again in a sec!",
      actions: []
    });
  }
};
