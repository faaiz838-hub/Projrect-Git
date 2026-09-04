const crypto = require('crypto');

function encryptionKey() {
  const value = String(process.env.APP_ENCRYPTION_KEY || '');
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('APP_ENCRYPTION_KEY must be a unique 64-character hexadecimal value for this installation.');
  }
  return Buffer.from(value, 'hex');
}

function encryptApiKey(apiKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

function decryptApiKey(value) {
  const [ivText, tagText, ciphertextText] = String(value || '').split('.');
  if (!ivText || !tagText || !ciphertextText) throw new Error('The stored AI credential is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64')), decipher.final()]).toString('utf8');
}

class AiProvider {
  async testConnection() { throw new Error('AiProvider#testConnection must be implemented.'); }
  async draftReply() { throw new Error('AiProvider#draftReply must be implemented.'); }
}

function draftInstructions({ message, recentTurns = [], facts = [] }) {
  return {
    system: 'Answer only the specific question the customer just asked, in at most 2 short sentences. Use only the supplied facts, and only the facts relevant to the question. Do not restate unrelated facts, policies, or promotional content even if present in the facts. Do not invent facts, ask for or repeat personal data, mention internal systems, or take actions. If no facts are provided, state that a team member can help.',
    input: { message: String(message).slice(0, 2000), recent_turns: recentTurns.slice(-6).map((turn) => ({ role: turn.role === 'assistant' ? 'assistant' : 'customer', text: String(turn.text || '').slice(0, 1000) })), facts: facts.map((fact) => String(fact).slice(0, 1000)) }
  };
}

class AnthropicAiProvider extends AiProvider {
  async testConnection(apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } });
    if (!response.ok) throw new Error(`Anthropic connection failed (${response.status}): ${connectionErrorHint(response.status)}`);
  }
  async draftReply({ apiKey, ...payload }) {
    const prompt = draftInstructions(payload);
    const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 220, system: prompt.system, messages: [{ role: 'user', content: JSON.stringify(prompt.input) }] }) });
    if (!response.ok) throw new Error('Anthropic reply request failed.');
    const data = await response.json();
    return String(data.content?.[0]?.text || '').trim();
  }
}

class OpenAiProvider extends AiProvider {
  async testConnection(apiKey) {
    const response = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${apiKey}` } });
    if (!response.ok) throw new Error(`OpenAI connection failed (${response.status}): ${connectionErrorHint(response.status)}`);
  }
  async draftReply({ apiKey, ...payload }) {
    const prompt = draftInstructions(payload);
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: 'gpt-4.1-mini', instructions: prompt.system, input: JSON.stringify(prompt.input), max_output_tokens: 220 }) });
    if (!response.ok) throw new Error('OpenAI reply request failed.');
    const data = await response.json();
    return String(data.output_text || '').trim();
  }
}

function connectionErrorHint(status) {
  if (status === 401) return 'check the API key.';
  if (status === 403) return 'check the project permissions.';
  if (status === 429) return 'check the provider account quota or billing.';
  return 'the provider did not accept this request.';
}

const aiProviders = { anthropic: new AnthropicAiProvider(), openai: new OpenAiProvider() };

module.exports = { aiProviders, encryptApiKey, decryptApiKey };