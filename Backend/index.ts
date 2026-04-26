import express from "express";
import { tavily } from "@tavily/core";
import { GoogleGenAI } from "@google/genai";
import { PROMPT_TEMPLATE, SYSTEM_PROMPT } from "./prompt";

const app = express();
const ai = new GoogleGenAI({});
const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
const PORT = 3000;

app.use(express.json());

app.post('/ask', async (req, res) => {
    // STEP 1 : Get the query from user
    const { query } = req.body;

    // STEP 2 : Make sure the user has access/credits to hit the end point

    // STEP 3 : Check if we have web search indexed for a similar query

    // STEP 4 : Web search to gather resources
    const webSearchResponse  = await client.search(query, {
        searchDepth: "advanced",
        includeImages: true,
    })

    const webSearchResults = webSearchResponse.results;
    console.log(webSearchResults);

    // STEP 5: Do some context engineering on the prompt + web search responses

    // STEP 6 : Hit the LLM and stream back the response 
    const prompt = PROMPT_TEMPLATE
        .replace('{{USER_QUERY}}', query)
        .replace('{{WEB_SEARCH_RESULTS}}', JSON.stringify(webSearchResults));
    
    const response = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
            systemInstruction: SYSTEM_PROMPT
        }
    });

    for await (const chunk of response) {
        res.write(chunk.text);
    }

    res.write('\n\n----------Sources----------\n\n');

    // STEP 7 : Also stream back the sources and follow up questions (hich we can get from another parallel LLM call )
    res.write(JSON.stringify(webSearchResults.map((result, index) => ({ title: result.title, url: result.url, image: webSearchResponse.images[index] || null }))))

    // STEP 8 : Close the event stream
    res.end();
})

app.listen(PORT, () => {
    console.log(`Server started listening on Port:${PORT}`);
})