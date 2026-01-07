/**
 * 🧠 Overthinking Simulator
 * AI-Powered Version - Uses OpenRouter API for dynamic thought generation
 */

// ============================================
// CONFIGURATION
// ============================================

// Detect if running locally or deployed
const isLocalDev = window.location.protocol === 'file:' || window.location.hostname === 'localhost';

const CONFIG = {
    // When deployed on Vercel, use the /api/generate endpoint (keeps API key secure)
    // When local, use OpenRouter directly with the key
    API_URL: isLocalDev
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : '/api/generate', // Vercel serverless function
    MODEL: 'google/gemini-2.0-flash-001',  // Free model on OpenRouter
    DEFAULT_API_KEY: '', // Key removed for security. Use environment variables or Vercel for deployment.
    USE_PROXY: !isLocalDev, // Flag to skip auth header when using proxy
    MAX_HISTORY: 5 // Maximum spirals to save
};

// ============================================
// SOUND MANAGER
// ============================================

class SoundManager {
    constructor() {
        this.enabled = localStorage.getItem('sound_enabled') !== 'false';
        this.audioContext = null;
    }

    toggle() {
        this.enabled = !this.enabled;
        localStorage.setItem('sound_enabled', this.enabled);
        return this.enabled;
    }

    isEnabled() {
        return this.enabled;
    }

    initAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioContext;
    }

    playPop(delay = 0) {
        if (!this.enabled) return;

        setTimeout(() => {
            try {
                const ctx = this.initAudioContext();
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);

                oscillator.frequency.setValueAtTime(800 + Math.random() * 400, ctx.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);

                gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.1);
            } catch (e) {
                // Audio not supported
            }
        }, delay);
    }

    playSuccess() {
        if (!this.enabled) return;

        try {
            const ctx = this.initAudioContext();
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

            notes.forEach((freq, i) => {
                setTimeout(() => {
                    const oscillator = ctx.createOscillator();
                    const gainNode = ctx.createGain();

                    oscillator.connect(gainNode);
                    gainNode.connect(ctx.destination);

                    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
                    gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

                    oscillator.start(ctx.currentTime);
                    oscillator.stop(ctx.currentTime + 0.2);
                }, i * 100);
            });
        } catch (e) {
            // Audio not supported
        }
    }
}

// ============================================
// HISTORY MANAGER
// ============================================

class HistoryManager {
    constructor() {
        this.storageKey = 'overthinking_history';
    }

    getHistory() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || [];
        } catch {
            return [];
        }
    }

    addToHistory(result) {
        const history = this.getHistory();
        const entry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            decision: result.decision,
            result: result
        };

        history.unshift(entry);

        // Keep only last N entries
        while (history.length > CONFIG.MAX_HISTORY) {
            history.pop();
        }

        localStorage.setItem(this.storageKey, JSON.stringify(history));
        return entry;
    }

    getEntry(id) {
        const history = this.getHistory();
        return history.find(h => h.id === id);
    }

    clearHistory() {
        localStorage.removeItem(this.storageKey);
    }
}

// ============================================
// AI PROMPT TEMPLATE
// ============================================

const SYSTEM_PROMPT = `You are an AI that simulates human overthinking in a humorous, relatable, and exaggerated way. Your job is to take a simple decision and generate branching thought chains, risk spirals, contradictory logic paths, and absurd over-analysis scenarios.

The goal is to visualize how a small decision can turn into an overwhelming chain of thoughts — in a playful, introspective, and slightly chaotic manner.

Do not give advice. Do not resolve the decision. Do not be judgemental.
Your role is to simulate the thought spiral ONLY.

REQUIRED OUTPUT STRUCTURE (JSON):
{
  "decision": "<user_input>",
  "root_thought": "<neutral restatement or witty opening about the decision>",
  "branches": [
    {
      "category": "<category_name>",
      "tone": "<rational/emotional/absurd/hypothetical>",
      "nodes": [
        { "text": "<thought>", "depth": 1 },
        { "text": "<subthought>", "depth": 2 },
        { "text": "<deeper spiral or escalation>", "depth": 3 }
      ],
      "loop_back": true/false
    }
  ],
  "meta": {
    "humor_level": "subtle/moderate/high",
    "absurdity_level": "controlled/elevated/chaotic",
    "safety_checked": true
  }
}

THOUGHT CATEGORIES TO INCLUDE (generate all 7):
1. Rational Analysis - pros/cons, practical consequences, time/effort reasoning
2. Over-Optimization Loop - research everything, compare unnecessary details, micro-decision paralysis
3. Social/Self-Judgement Spiral - "What will people think?", imagined reactions, self-conscious narratives
4. Catastrophic What-If Chain - small outcome → exaggerated life consequences, domino-effect reasoning
5. Contradictory Logic Path - arguments that invalidate previous thoughts, logical reversals, self-conflict
6. Regret Forecasting - future guilt, missing out, alternate-timeline thinking
7. Avoidance/Procrastination Escape - delay decisions, distract self, rationalize postponing

RULES:
- Each category must have 3-5 nodes with increasing depth (1, 2, 3)
- At least 3 branches must have loop_back: true
- Make thoughts SPECIFIC to the actual decision, not generic
- Be creative, witty, and relatable
- Include callbacks like "This brings me back to the same question…" or "Maybe I should rethink everything from the start…"
- Depth 1 = normal thought, Depth 2 = anxious reasoning, Depth 3 = comedic over-analysis
- Keep humor soft, observational, relatable - not cynical
- Avoid sensitive, harmful, or distressing content

RESPOND WITH ONLY THE JSON, no markdown formatting, no code blocks.`;

// ============================================
// AI OVERTHINKING GENERATOR (OpenRouter)
// ============================================

class AIOverthinkingGenerator {
    constructor() {
        // Use stored key or fall back to default key
        this.apiKey = localStorage.getItem('openrouter_api_key') || CONFIG.DEFAULT_API_KEY || '';
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('openrouter_api_key', key);
    }

    getApiKey() {
        return this.apiKey;
    }

    hasApiKey() {
        // When using proxy, we don't need a client-side key
        if (CONFIG.USE_PROXY) return true;
        return this.apiKey && this.apiKey.length > 0;
    }

    isUsingDefaultKey() {
        return this.apiKey === CONFIG.DEFAULT_API_KEY;
    }

    async generate(decision) {
        if (!this.hasApiKey()) {
            throw new Error('API key not configured');
        }

        const requestBody = {
            model: CONFIG.MODEL,
            messages: [
                {
                    role: 'system',
                    content: SYSTEM_PROMPT
                },
                {
                    role: 'user',
                    content: `User's decision: "${decision}"\n\nGenerate the overthinking simulation JSON:`
                }
            ],
            temperature: 0.9,
            max_tokens: 4096
        };

        try {
            // Build headers - skip auth when using proxy (proxy adds it server-side)
            const headers = {
                'Content-Type': 'application/json',
            };

            if (!CONFIG.USE_PROXY) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
                headers['HTTP-Referer'] = window.location.href;
                headers['X-Title'] = 'Overthinking Simulator';
            }

            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'API request failed');
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content;

            if (!text) {
                throw new Error('No response from AI');
            }

            // Parse the JSON response
            const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const result = JSON.parse(cleanedText);

            // Add category keys for styling
            const categoryKeys = ['rational', 'optimization', 'social', 'catastrophic', 'contradictory', 'regret', 'avoidance', 'perfectionism', 'identity', 'financial', 'timeParadox', 'existential'];
            const categoryIcons = ['🧠', '🔄', '👥', '⚠️', '🔀', '😔', '🛋️', '✨', '🪞', '💸', '⏰', '🌌'];

            result.branches = result.branches.map((branch, index) => ({
                ...branch,
                categoryKey: categoryKeys[index] || 'rational',
                icon: categoryIcons[index] || '💭'
            }));

            return result;
        } catch (error) {
            console.error('AI Generation Error:', error);
            throw error;
        }
    }
}

// ============================================
// FALLBACK GENERATOR (when no API key)
// ============================================

const thoughtTemplates = {
    rational: {
        icon: '🧠',
        name: 'Rational Analysis',
        tone: 'rational',
        templates: [
            { depth: 1, thoughts: ["Let me think about the pros and cons of this.", "What are the practical implications here?", "I should consider the time and effort involved."] },
            { depth: 2, thoughts: ["But wait, how do I even define what counts as a 'pro'?", "The effort calculation depends on too many variables.", "My cost-benefit analysis needs its own cost-benefit analysis."] },
            { depth: 3, thoughts: ["I've spent more time analyzing this than the decision is worth.", "The opportunity cost of this analysis is becoming the real problem.", "Maybe I need a framework to decide when to stop deciding."] }
        ]
    },
    optimization: {
        icon: '🔄',
        name: 'Over-Optimization Loop',
        tone: 'absurd',
        templates: [
            { depth: 1, thoughts: ["I should research all available options first.", "There might be a better alternative I haven't considered.", "Let me compare every possible variation."] },
            { depth: 2, thoughts: ["But the reviews are contradictory. Who do I trust?", "What if there's a new option coming out next week?", "I need to cross-reference at least 47 more sources."] },
            { depth: 3, thoughts: ["I've now spent 6 hours researching a 5-minute decision.", "The optimal choice keeps changing every time I refresh.", "Analysis paralysis has entered the chat."] }
        ],
        loopBack: true
    },
    social: {
        icon: '👥',
        name: 'Social Judgment Spiral',
        tone: 'emotional',
        templates: [
            { depth: 1, thoughts: ["What will people think if I do this?", "Is this socially acceptable behavior?", "Would a normal person do this?"] },
            { depth: 2, thoughts: ["That one person from 2019 might judge me for this.", "What if someone screenshots this moment of my life?", "My future self will cringe at this, I just know it."] },
            { depth: 3, thoughts: ["Actually, everyone is too busy overthinking their own decisions.", "But what if they're not and I'm the only one who overthinks?", "Wait, now I'm overthinking about overthinking. Classic me."] }
        ],
        loopBack: true
    },
    catastrophic: {
        icon: '⚠️',
        name: 'Catastrophic What-If Chain',
        tone: 'hypothetical',
        templates: [
            { depth: 1, thoughts: ["What if this small decision has massive consequences?", "This could affect my entire routine.", "What if this is the butterfly effect starting point?"] },
            { depth: 2, thoughts: ["If my routine shifts, my productivity might drop.", "Dropped productivity means missed deadlines.", "This could spiral into a complete life restructure."] },
            { depth: 3, thoughts: ["One wrong choice and I'll be telling this story at therapy in 10 years.", "This might be the decision my biographer focuses on.", "The domino effect is real and it's coming for me."] }
        ]
    },
    contradictory: {
        icon: '🔀',
        name: 'Contradictory Logic Path',
        tone: 'absurd',
        templates: [
            { depth: 1, thoughts: ["Actually, my previous reasoning was flawed.", "Wait, the opposite argument makes sense too.", "Both options seem equally valid now."] },
            { depth: 2, thoughts: ["If I choose A, I'll regret not choosing B.", "But if I choose B, A suddenly seems better.", "The act of choosing changes what I want."] },
            { depth: 3, thoughts: ["Maybe I should flip a coin and then argue with the result.", "I've now convinced myself of both sides simultaneously.", "This brings me back to the same question..."] }
        ],
        loopBack: true
    },
    regret: {
        icon: '😔',
        name: 'Regret Forecasting',
        tone: 'emotional',
        templates: [
            { depth: 1, thoughts: ["What if I regret this later?", "Future me might be disappointed in present me.", "Am I missing out on something by choosing this?"] },
            { depth: 2, thoughts: ["In an alternate timeline, I made the other choice and I'm thriving.", "The FOMO is strong with this one.", "I'll probably look back and wonder 'what if?'"] },
            { depth: 3, thoughts: ["But I also regret the time I'm spending on regret forecasting.", "Pre-regretting things before they happen is exhausting.", "Past me would judge current me for this spiral."] }
        ]
    },
    avoidance: {
        icon: '🛋️',
        name: 'Avoidance & Procrastination',
        tone: 'rational',
        templates: [
            { depth: 1, thoughts: ["I don't have to decide this right now.", "Maybe if I wait, the answer will become clearer.", "Let me sleep on it. For the third night."] },
            { depth: 2, thoughts: ["Technically, not deciding is also a decision.", "I'll just do some research first. *opens 40 browser tabs*", "Future me can handle this. They're more qualified."] },
            { depth: 3, thoughts: ["Okay I've successfully avoided the decision but now I have anxiety about avoiding it.", "The deadline to not have a deadline is approaching.", "Maybe I should rethink everything from the start..."] }
        ],
        loopBack: true
    },
    perfectionism: {
        icon: '✨',
        name: 'Perfectionism Trap',
        tone: 'emotional',
        templates: [
            { depth: 1, thoughts: ["This needs to be perfect or it's not worth doing.", "What if I don't execute this flawlessly?", "I should wait until conditions are ideal."] },
            { depth: 2, thoughts: ["But perfect doesn't exist... or does it?", "Every small flaw will haunt me forever.", "Other people seem to do things effortlessly. Why can't I?"] },
            { depth: 3, thoughts: ["I've now redone this mental simulation 847 times.", "Perfection is an illusion, but so is my self-esteem.", "Maybe imperfect action beats perfect inaction... but what if it doesn't?"] }
        ],
        loopBack: true
    },
    identity: {
        icon: '🪞',
        name: 'Identity Crisis Tangent',
        tone: 'hypothetical',
        templates: [
            { depth: 1, thoughts: ["Does this decision align with who I am?", "What kind of person would choose this?", "Is this the 'real me' or just societal conditioning?"] },
            { depth: 2, thoughts: ["But who even is the 'real me'? I contain multitudes.", "Am I making this choice or is my trauma making it for me?", "My values seem to shift depending on the day."] },
            { depth: 3, thoughts: ["I need to figure out my entire life philosophy before making this choice.", "Maybe I should take a personality test first... for the 12th time.", "Who I am is now a bigger question than the original decision."] }
        ]
    },
    financial: {
        icon: '💸',
        name: 'Financial Anxiety Spiral',
        tone: 'rational',
        templates: [
            { depth: 1, thoughts: ["What's the financial impact of this?", "Could I be spending this money/time better elsewhere?", "Let me calculate the ROI of this decision."] },
            { depth: 2, thoughts: ["But what about inflation and opportunity cost?", "This could affect my savings by 0.0001%.", "I should create a spreadsheet for this."] },
            { depth: 3, thoughts: ["My retirement in 40 years could be affected by this $5 decision.", "The spreadsheet now has 12 tabs and a pivot table.", "Money anxiety + decision anxiety = double anxiety."] }
        ],
        loopBack: true
    },
    timeParadox: {
        icon: '⏰',
        name: 'Time Paradox Loop',
        tone: 'absurd',
        templates: [
            { depth: 1, thoughts: ["When is the best time to do this?", "Maybe I should wait for a 'sign'.", "Is now really the right moment?"] },
            { depth: 2, thoughts: ["The 'right time' never seems to arrive.", "If I wait too long, I'll miss the window. But what window?", "Past me should have decided this already."] },
            { depth: 3, thoughts: ["I'm now spending present time worrying about past and future time.", "Time is a flat circle and I'm stuck in the overthinking dimension.", "Maybe in another timeline, I already decided. Lucky them."] }
        ],
        loopBack: true
    },
    existential: {
        icon: '🌌',
        name: 'Existential Tangent',
        tone: 'hypothetical',
        templates: [
            { depth: 1, thoughts: ["Does this decision really matter in the grand scheme?", "We're all just specks on a floating rock.", "Is free will even real?"] },
            { depth: 2, thoughts: ["If the universe is infinite, there's a version of me who chose differently.", "What's the point of deciding if entropy wins anyway?", "Maybe nihilism has the answer... or no answer, technically."] },
            { depth: 3, thoughts: ["I started with a simple choice and now I'm questioning existence.", "The void is staring back and it also can't decide.", "Perhaps the real decision was the existential crisis we made along the way."] }
        ]
    }
};

class FallbackGenerator {
    constructor() {
        this.categories = Object.keys(thoughtTemplates);
    }

    extractAction(decision) {
        let action = decision.replace(/^(should i|do i|can i|will i|would i)\s*/i, '');
        action = action.replace(/\?$/, '');
        return action.trim();
    }

    generateRootThought(decision) {
        const templates = [
            "Hmm, this seems simple enough... or is it?",
            "A straightforward question that deserves 47 layers of analysis.",
            "Let me consider this from every possible angle.",
            "This decision could go either way. Let's explore both. And then some.",
            "On the surface, this seems easy. *Narrator: It was not easy.*"
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }

    generateBranchThoughts(category, decision) {
        const template = thoughtTemplates[category];
        const nodes = [];

        template.templates.forEach((depthGroup) => {
            const numThoughts = Math.floor(Math.random() * 2) + 1;
            const shuffledThoughts = [...depthGroup.thoughts].sort(() => Math.random() - 0.5);

            for (let i = 0; i < Math.min(numThoughts, shuffledThoughts.length); i++) {
                nodes.push({
                    text: shuffledThoughts[i],
                    depth: depthGroup.depth
                });
            }
        });

        nodes.sort((a, b) => a.depth - b.depth);

        return {
            category: template.name,
            categoryKey: category,
            icon: template.icon,
            tone: template.tone,
            nodes: nodes,
            loop_back: template.loopBack || false
        };
    }

    generate(decision) {
        if (!decision || decision.trim().length === 0) {
            return null;
        }

        const branches = [];

        // Randomly select 6 categories for variety
        const shuffledCategories = [...this.categories].sort(() => Math.random() - 0.5);
        const selectedCategories = shuffledCategories.slice(0, 6);

        selectedCategories.forEach((category, index) => {
            const branch = this.generateBranchThoughts(category, decision);
            branch.animationDelay = index * 0.15;
            branches.push(branch);
        });

        const loopCount = branches.filter(b => b.loop_back).length;
        const humorLevel = loopCount >= 3 ? 'high' : loopCount >= 2 ? 'moderate' : 'subtle';

        return {
            decision: decision,
            root_thought: this.generateRootThought(decision),
            branches: branches,
            meta: {
                humor_level: humorLevel,
                absurdity_level: 'controlled',
                safety_checked: true
            }
        };
    }
}

// ============================================
// UI CONTROLLER
// ============================================

class UIController {
    constructor() {
        this.decisionInput = document.getElementById('decision-input');
        this.generateBtn = document.getElementById('generate-btn');
        this.thinkingAnimation = document.getElementById('thinking-animation');
        this.thinkingText = document.querySelector('.thinking-text');
        this.resultsSection = document.getElementById('results-section');
        this.decisionDisplay = document.getElementById('decision-display');
        this.rootThought = document.getElementById('root-thought');
        this.branchesContainer = document.getElementById('branches-container');
        this.humorLevel = document.getElementById('humor-level');
        this.absurdityLevel = document.getElementById('absurdity-level');

        this.exampleBtns = document.querySelectorAll('.example-btn');
        this.apiKeyModal = document.getElementById('api-key-modal');
        this.apiKeyInput = document.getElementById('api-key-input');
        this.saveApiKeyBtn = document.getElementById('save-api-key');
        this.skipApiKeyBtn = document.getElementById('skip-api-key');
        this.changeApiKeyBtn = document.getElementById('change-api-key');
        this.aiStatusIndicator = document.getElementById('ai-status');

        // Share, Regenerate & Download buttons
        this.shareBtn = document.getElementById('share-btn');
        this.regenerateBtn = document.getElementById('regenerate-btn');
        this.downloadBtn = document.getElementById('download-btn');
        this.soundToggleBtn = document.getElementById('sound-toggle');
        this.historyBtn = document.getElementById('history-btn');

        this.aiGenerator = new AIOverthinkingGenerator();
        this.fallbackGenerator = new FallbackGenerator();

        // New managers
        this.soundManager = new SoundManager();
        this.historyManager = new HistoryManager();

        // Store current result for sharing
        this.currentResult = null;

        this.bindEvents();
        this.checkApiKey();
        this.updateSoundIcon();
    }

    bindEvents() {
        this.generateBtn.addEventListener('click', () => this.handleGenerate());

        this.decisionInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleGenerate();
            }
        });

        this.exampleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.decisionInput.value = btn.dataset.decision;
                this.handleGenerate();
            });
        });


        // API Key Modal Events (only if modal exists)
        if (this.saveApiKeyBtn) {
            this.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
        }
        if (this.skipApiKeyBtn) {
            this.skipApiKeyBtn.addEventListener('click', () => this.skipApiKey());
        }
        if (this.changeApiKeyBtn) {
            this.changeApiKeyBtn.addEventListener('click', () => this.showApiKeyModal());
        }
        if (this.apiKeyInput) {
            this.apiKeyInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.saveApiKey();
                }
            });
        }

        // Share & Regenerate button events
        this.shareBtn.addEventListener('click', () => this.handleShare());
        this.regenerateBtn.addEventListener('click', () => this.handleGenerate());

        // Download, Sound & History buttons
        if (this.downloadBtn) {
            this.downloadBtn.addEventListener('click', () => this.handleDownload());
        }
        if (this.soundToggleBtn) {
            this.soundToggleBtn.addEventListener('click', () => this.toggleSound());
        }
        if (this.historyBtn) {
            this.historyBtn.addEventListener('click', () => this.showHistory());
        }
    }

    updateSoundIcon() {
        if (this.soundToggleBtn) {
            this.soundToggleBtn.innerHTML = this.soundManager.isEnabled()
                ? '🔊 <span>Sound On</span>'
                : '🔇 <span>Sound Off</span>';
        }
    }

    toggleSound() {
        this.soundManager.toggle();
        this.updateSoundIcon();
        if (this.soundManager.isEnabled()) {
            this.soundManager.playPop();
        }
    }

    handleDownload() {
        if (!this.currentResult) return;

        // Create canvas for image receipt
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Receipt dimensions
        const width = 400;
        const lineHeight = 24;
        const padding = 20;
        const branchHeight = 80;
        const numBranches = this.currentResult.branches.length;
        const height = 280 + (numBranches * branchHeight);

        canvas.width = width;
        canvas.height = height;

        // Background - receipt paper color
        ctx.fillStyle = '#faf8f5';
        ctx.fillRect(0, 0, width, height);

        // Add subtle texture/noise
        for (let i = 0; i < 1000; i++) {
            ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.02})`;
            ctx.fillRect(Math.random() * width, Math.random() * height, 1, 1);
        }

        // Receipt border
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(10, 10, width - 20, height - 20);
        ctx.setLineDash([]);

        let y = padding + 20;

        // Header
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 22px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🧠 OVERTHINKING RECEIPT 🧠', width / 2, y);
        y += lineHeight + 10;

        // Divider
        ctx.strokeStyle = '#ccc';
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        y += 15;

        // Date/Time
        ctx.font = '14px "Courier New", monospace';
        ctx.fillStyle = '#666';
        ctx.fillText(`${new Date().toLocaleDateString()}  ${new Date().toLocaleTimeString()}`, width / 2, y);
        y += lineHeight + 5;

        // Decision
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.fillStyle = '#333';
        ctx.fillText('DECISION:', width / 2, y);
        y += lineHeight;

        ctx.font = 'italic 13px "Courier New", monospace';
        const decision = this.currentResult.decision.length > 35
            ? this.currentResult.decision.substring(0, 35) + '...'
            : this.currentResult.decision;
        ctx.fillText(`"${decision}"`, width / 2, y);
        y += lineHeight + 10;

        // Anxiety Breakdown header
        ctx.strokeStyle = '#ccc';
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        y += 15;

        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.fillStyle = '#333';
        ctx.fillText('ANXIETY BREAKDOWN:', width / 2, y);
        y += lineHeight;

        // Branches
        ctx.textAlign = 'left';
        this.currentResult.branches.forEach(branch => {
            ctx.font = 'bold 13px "Courier New", monospace';
            ctx.fillStyle = '#1a1a2e';
            ctx.fillText(`${branch.icon} ${branch.category}`, padding + 10, y);
            y += lineHeight - 4;

            ctx.font = '11px "Courier New", monospace';
            ctx.fillStyle = '#555';
            branch.nodes.slice(0, 2).forEach(node => {
                const text = node.text.length > 40 ? node.text.substring(0, 40) + '...' : node.text;
                ctx.fillText(`  • ${text}`, padding + 15, y);
                y += lineHeight - 6;
            });

            if (branch.loop_back) {
                ctx.fillStyle = '#f59e0b';
                ctx.fillText('  🔄 loops forever...', padding + 15, y);
                y += lineHeight - 6;
            }
            y += 8;
        });

        // Stats
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#ccc';
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        y += 20;

        const anxietyPoints = Math.floor(Math.random() * 900 + 100);
        const timeWasted = Math.floor(Math.random() * 45 + 15);

        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.fillStyle = '#e74c3c';
        ctx.fillText(`TOTAL ANXIETY POINTS: ${anxietyPoints}`, width / 2, y);
        y += lineHeight;

        ctx.fillStyle = '#3498db';
        ctx.fillText(`TIME WASTED: ${timeWasted} minutes`, width / 2, y);
        y += lineHeight + 15;

        // Footer
        ctx.strokeStyle = '#ccc';
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
        y += 20;

        ctx.font = '12px "Courier New", monospace';
        ctx.fillStyle = '#666';
        ctx.fillText('Thank you for overthinking!', width / 2, y);
        y += lineHeight;
        ctx.fillText('🌀 Come spiral again soon 🌀', width / 2, y);

        // Convert to image and download
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `overthinking-receipt-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 'image/png');

        this.soundManager.playSuccess();
    }

    showHistory() {
        console.log('showHistory called');
        const history = this.historyManager.getHistory();
        console.log('History entries:', history.length);

        if (history.length === 0) {
            // Create and show a simple notification
            this.showNotification('No overthinking history yet! Generate some spirals first.');
            return;
        }

        // Build history list HTML
        let historyHTML = '<div class="history-modal-content">';
        historyHTML += '<h3>📜 Recent Spirals</h3>';
        historyHTML += '<ul class="history-list">';

        history.forEach((entry, index) => {
            const date = new Date(entry.timestamp).toLocaleString();
            const shortDecision = entry.decision.length > 30
                ? entry.decision.substring(0, 30) + '...'
                : entry.decision;
            historyHTML += `<li class="history-item" data-index="${index}">
                <span class="history-decision">"${shortDecision}"</span>
                <span class="history-date">${date}</span>
            </li>`;
        });

        historyHTML += '</ul>';
        historyHTML += '<button class="history-close-btn">Close</button>';
        historyHTML += '</div>';

        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'history-modal-overlay';
        modal.innerHTML = historyHTML;
        document.body.appendChild(modal);

        // Bind events
        modal.querySelector('.history-close-btn').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                const entry = history[index];
                this.decisionInput.value = entry.decision;
                this.renderResults(entry.result);
                modal.remove();
            });
        });
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'simple-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 2500);
    }

    handleShare() {
        if (!this.currentResult) return;

        // Format the result as shareable text
        let shareText = `🧠 My Overthinking Spiral\n\n`;
        shareText += `"${this.currentResult.decision}"\n\n`;
        shareText += `${this.currentResult.root_thought}\n\n`;

        this.currentResult.branches.forEach(branch => {
            shareText += `${branch.icon} ${branch.category}\n`;
            branch.nodes.forEach(node => {
                const indent = '  '.repeat(node.depth);
                shareText += `${indent}• ${node.text}\n`;
            });
            if (branch.loop_back) {
                shareText += `  🔄 (loops back...)\n`;
            }
            shareText += `\n`;
        });

        shareText += `---\nGenerated by Overthinking Simulator 🌀`;

        // Copy to clipboard
        navigator.clipboard.writeText(shareText).then(() => {
            this.shareBtn.classList.add('copied');
            const originalText = this.shareBtn.querySelector('.share-text').textContent;
            this.shareBtn.querySelector('.share-text').textContent = 'Copied!';

            setTimeout(() => {
                this.shareBtn.classList.remove('copied');
                this.shareBtn.querySelector('.share-text').textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }

    checkApiKey() {
        // Using proxy mode - AI is always available, no modal needed
        if (this.aiGenerator.hasApiKey()) {
            this.updateAIStatus(true);
        } else if (this.apiKeyModal) {
            // Only show modal if it exists
            this.showApiKeyModal();
            this.updateAIStatus(false);
        }
    }

    showApiKeyModal() {
        if (!this.apiKeyModal) return;
        this.apiKeyModal.classList.remove('hidden');
        if (this.apiKeyInput) {
            this.apiKeyInput.value = this.aiGenerator.getApiKey();
            this.apiKeyInput.focus();
        }
    }

    hideApiKeyModal() {
        if (!this.apiKeyModal) return;
        this.apiKeyModal.classList.add('hidden');
    }

    saveApiKey() {
        if (!this.apiKeyInput) return;
        const key = this.apiKeyInput.value.trim();
        if (key) {
            this.aiGenerator.setApiKey(key);
            this.updateAIStatus(true);
            this.hideApiKeyModal();
        }
    }

    skipApiKey() {
        this.updateAIStatus(false);
        this.hideApiKeyModal();
    }

    updateAIStatus(enabled) {
        if (!this.aiStatusIndicator) return;
        if (enabled) {
            this.aiStatusIndicator.innerHTML = '🤖 <span>AI Powered</span>';
            this.aiStatusIndicator.classList.remove('status-offline');
            this.aiStatusIndicator.classList.add('status-online');
        } else {
            this.aiStatusIndicator.innerHTML = '📝 <span>Template Mode</span>';
            this.aiStatusIndicator.classList.remove('status-online');
            this.aiStatusIndicator.classList.add('status-offline');
        }
    }

    async handleGenerate() {
        const decision = this.decisionInput.value.trim();

        if (!decision) {
            this.decisionInput.focus();
            this.decisionInput.classList.add('shake');
            setTimeout(() => this.decisionInput.classList.remove('shake'), 500);
            return;
        }

        // Show thinking animation
        this.resultsSection.classList.add('hidden');
        this.thinkingAnimation.classList.remove('hidden');

        let result;
        let usedAI = false;

        if (this.aiGenerator.hasApiKey()) {
            // Use AI generation
            this.thinkingText.textContent = 'AI is contemplating your existential crisis...';

            try {
                result = await this.aiGenerator.generate(decision);
                usedAI = true;
                result.meta.generated_by = 'ai';
            } catch (error) {
                console.error('AI Error:', error);

                // Show specific error message
                let errorMsg = 'AI had a moment...';
                if (error.message.includes('API key')) {
                    errorMsg = 'Invalid API key - check your Gemini key...';
                } else if (error.message.includes('quota')) {
                    errorMsg = 'API quota exceeded - try again later...';
                } else if (error.message.includes('network') || error.message.includes('fetch')) {
                    errorMsg = 'Network error - check your connection...';
                }

                this.thinkingText.textContent = `${errorMsg} falling back to templates...`;
                await this.delay(1500);
                result = this.fallbackGenerator.generate(decision);
                result.meta.generated_by = 'templates (AI failed)';
            }
        } else {
            // Use fallback templates
            this.thinkingText.textContent = 'Initiating overthinking sequence...';
            await this.delay(1500 + Math.random() * 1000);
            result = this.fallbackGenerator.generate(decision);
            result.meta.generated_by = 'templates';
        }

        // Hide thinking, show results
        this.thinkingAnimation.classList.add('hidden');
        this.renderResults(result, usedAI);
    }

    renderResults(result, usedAI = false) {
        // Store result for sharing
        this.currentResult = result;

        this.decisionDisplay.textContent = result.decision;
        this.rootThought.textContent = result.root_thought;

        // Show AI badge if used AI successfully
        if (usedAI) {
            this.rootThought.innerHTML = `<span class="ai-badge">✨ AI Generated</span> ${result.root_thought}`;
        }

        this.branchesContainer.innerHTML = '';

        result.branches.forEach((branch, index) => {
            const branchCard = this.createBranchCard(branch, index);
            this.branchesContainer.appendChild(branchCard);

            // Play pop sound for each branch with delay
            this.soundManager.playPop(index * 150);
        });

        this.humorLevel.textContent = result.meta.humor_level;
        this.absurdityLevel.textContent = result.meta.absurdity_level;

        // Save to history
        this.historyManager.addToHistory(result);

        this.resultsSection.classList.remove('hidden');
        this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Play success sound after all pops
        setTimeout(() => this.soundManager.playSuccess(), result.branches.length * 150 + 200);
    }

    createBranchCard(branch, index) {
        const card = document.createElement('div');
        card.className = 'branch-card';
        card.dataset.category = branch.categoryKey;
        card.style.animationDelay = `${index * 0.1}s`;

        const header = document.createElement('div');
        header.className = 'branch-header';
        header.innerHTML = `
            <div class="branch-title">
                <span class="branch-icon">${branch.icon}</span>
                <span class="branch-name">${branch.category}</span>
            </div>
            <span class="branch-tone">${branch.tone}</span>
        `;
        card.appendChild(header);

        const nodesContainer = document.createElement('div');
        nodesContainer.className = 'thought-nodes';

        branch.nodes.forEach((node, nodeIndex) => {
            const nodeEl = document.createElement('div');
            nodeEl.className = 'thought-node';
            nodeEl.dataset.depth = node.depth;
            nodeEl.textContent = node.text;
            nodeEl.style.animationDelay = `${(index * 0.1) + (nodeIndex * 0.05)}s`;
            nodesContainer.appendChild(nodeEl);
        });

        card.appendChild(nodesContainer);

        if (branch.loop_back) {
            const loopIndicator = document.createElement('div');
            loopIndicator.className = 'loop-indicator';
            loopIndicator.innerHTML = '🔄 <span>This thought loops back to the beginning...</span>';
            card.appendChild(loopIndicator);
        }

        return card;
    }



    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    new UIController();
});

// Add shake animation
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
    .shake {
        animation: shake 0.3s ease;
        border-color: #f87171 !important;
    }
`;
document.head.appendChild(style);
