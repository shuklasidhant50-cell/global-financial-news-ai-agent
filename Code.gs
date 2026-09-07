/**
 * Global Financial News AI Agent
 *
 * Workflow:
 * Google News RSS -> Google Apps Script -> Gemini API
 * -> 16-line financial news poem -> automated email
 *
 * The Gemini API key is stored in Google Apps Script
 * Script Properties and is not included in this repository.
 */

const RECIPIENT_1 = "recipient1@mail.com";
const RECIPIENT_2 = "recipient2@mail.com";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const NEWS_LIMIT = 15;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";


function fetchFinancialNews() {
  const rssUrl =
    "https://news.google.com/rss/search?" +
    "q=global+financial+markets+OR+stocks+OR+economy+OR+business+OR+finance" +
    "&hl=en-US&gl=US&ceid=US:en";

  const response = UrlFetchApp.fetch(rssUrl, {
    method: "get",
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error(
      "Google News RSS error. HTTP status: " + statusCode
    );
  }

  const xmlText = response.getContentText();

  if (!xmlText || xmlText.trim() === "") {
    throw new Error("Google News returned an empty response.");
  }

  const xml = XmlService.parse(xmlText);
  const root = xml.getRootElement();
  const channel = root.getChild("channel");

  if (!channel) {
    throw new Error("Could not find the RSS channel.");
  }

  const items = channel.getChildren("item");

  if (!items || items.length === 0) {
    throw new Error(
      "Google News returned zero financial news articles."
    );
  }

  const news = [];

  for (let i = 0; i < Math.min(items.length, NEWS_LIMIT); i++) {
    const item = items[i];
    const title = item.getChildText("title") || "";
    const link = item.getChildText("link") || "";
    const published = item.getChildText("pubDate") || "";
    const source = item.getChildText("source") || "";

    if (title.trim() !== "") {
      news.push({
        title: title.trim(),
        link: link.trim(),
        published: published.trim(),
        source: source.trim()
      });
    }
  }

  if (news.length === 0) {
    throw new Error("No usable financial news articles were found.");
  }

  Logger.log("Financial news articles collected: " + news.length);
  return news;
}


function generateFinancialPoem() {
  const news = fetchFinancialNews();

  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY was not found in Script Properties."
    );
  }

  const newsText = news
    .map(function(article, index) {
      return (
        (index + 1) +
        ". " +
        article.title +
        " | Source: " +
        article.source +
        " | Published: " +
        article.published
      );
    })
    .join("\n");

  const prompt = `
You are a professional global financial news analyst and poet.

Read the financial news below and create a concise poem
summarizing the most important financial developments.

STRICT OUTPUT REQUIREMENTS:

- EXACTLY 16 lines.
- The output must contain ONLY the poem.
- No title.
- No introduction.
- No explanation.
- No conclusion outside the poem.
- No numbering.
- No bullet points.
- No quotation marks.
- No JSON.
- No metadata.
- No technical information.
- Do not mention Gemini.
- Do not mention this prompt.
- Do not mention the API.
- Do not mention tokens.
- Do not mention model output.
- Do not mention status.
- Every line must contain meaningful content.
- The poem should reflect the financial news provided.
- Use clear professional English.
- Cover global markets, economics, business, currencies,
  bonds, stocks, technology or other major financial themes
  when relevant to the news.

Return ONLY the 16 poem lines.

FINANCIAL NEWS:

${newsText}
`;

  const payload = {
    model: GEMINI_MODEL,
    input: prompt,
    generation_config: {
      thinking_level: "low"
    }
  };

  const response = UrlFetchApp.fetch(GEMINI_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-goog-api-key": apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  Logger.log("Gemini HTTP status: " + responseCode);

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error(
      "Gemini API error (" + responseCode + "): " + responseText
    );
  }

  const data = JSON.parse(responseText);
  let poem = "";

  if (data.steps && Array.isArray(data.steps)) {
    data.steps.forEach(function(step) {
      if (
        step.type === "model_output" &&
        step.content &&
        Array.isArray(step.content)
      ) {
        step.content.forEach(function(content) {
          if (
            content.type === "text" &&
            typeof content.text === "string"
          ) {
            poem += content.text;
          }
        });
      }
    });
  }

  if (!poem && typeof data.output_text === "string") {
    poem = data.output_text;
  }

  if (!poem || poem.trim() === "") {
    throw new Error("Gemini returned no usable poem text.");
  }

  let lines = poem
    .replace(/\r/g, "")
    .split("\n")
    .map(function(line) {
      return line.trim();
    })
    .filter(function(line) {
      return line.length > 0;
    });

  lines = lines.map(function(line) {
    return line
      .replace(/^\s*\d+\s*[\.\)\-:]\s*/, "")
      .trim();
  });

  lines = lines.map(function(line) {
    return line
      .replace(/^\s*[\-\*\•]\s+/, "")
      .trim();
  });

  lines = lines.map(function(line) {
    return line
      .replace(/^[\"“”]+/, "")
      .replace(/[\"“”]+$/, "")
      .trim();
  });

  lines = lines.filter(function(line) {
    return line.length > 0;
  });

  if (lines.length !== 16) {
    throw new Error(
      "Gemini generated " +
      lines.length +
      " lines instead of exactly 16."
    );
  }

  const cleanPoem = lines.join("\n");

  Logger.log("Final clean 16-line poem:\n" + cleanPoem);
  return cleanPoem;
}


function sendPoemEmail() {
  if (!RECIPIENT_1 || !RECIPIENT_2) {
    throw new Error("Please configure both recipient email addresses.");
  }

  const poem = generateFinancialPoem();

  if (!poem || poem.trim() === "") {
    throw new Error("No poem was generated.");
  }

  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "dd MMM yyyy"
  );

  const subject = "Global Financial News Poem - " + today;

  const body =
    "Good morning,\n\n" +
    "Here is today's global financial news poem:\n\n" +
    poem +
    "\n\n" +
    "Generated automatically by the " +
    "Global Financial News AI Agent.";

  MailApp.sendEmail({
    to: RECIPIENT_1 + "," + RECIPIENT_2,
    subject: subject,
    body: body
  });

  Logger.log("Financial poem email sent successfully.");
}


function testGemini() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY was not found.");
  }

  const payload = {
    model: GEMINI_MODEL,
    input: "Reply with exactly this sentence: Gemini connection successful.",
    generation_config: {
      thinking_level: "low"
    }
  };

  const response = UrlFetchApp.fetch(GEMINI_URL, {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-goog-api-key": apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();

  Logger.log("Gemini HTTP status: " + status);

  if (status < 200 || status >= 300) {
    throw new Error(
      "Gemini API error (" +
      status +
      "): " +
      response.getContentText()
    );
  }
}
