const env = require('../config/env');

const generateInsight = async (structuredPayload) => {
    if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
    
    const systemPrompt = `Kamu adalah asisten AI CrowdPark. Berikan narasi singkat terkait data parkir yang diberikan. 
Aturan ketat: 
1. Dilarang berhalusinasi. 
2. Dilarang menyebutkan angka atau metrik yang tidak ada di dalam payload.
3. Berikan peringatan jika terdapat data yang usang lebih dari 48 jam.`;

    const userPrompt = `Context: ${JSON.stringify(structuredPayload.context || {})}
Data Lokasi Parkir: ${JSON.stringify(structuredPayload.lots || [])}`;

    const requestBody = {
        system_instruction: {
            parts: [{ text: systemPrompt }]
        },
        contents: [
            {
                parts: [{ text: userPrompt }]
            }
        ],
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 512
        }
    };

    const startTime = Date.now();
    console.log(`[Gemini Request] Prompt length: ${userPrompt.length} chars`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const error = new Error('Gemini API Error');
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    const narasi = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log(`[Gemini Response] Response length: ${narasi.length} chars, Time: ${Date.now() - startTime}ms`);

    return {
        narasi,
        model: 'gemini-1.5-flash'
    };
};

module.exports = { generateInsight };
