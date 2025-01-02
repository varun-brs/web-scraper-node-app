const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const app = express();
const port = process.env.PORT || 4005;

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(express.static("public"));

// Configure axios with headers to mimic a real browser
const axiosInstance = axios.create({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Cache-Control": "max-age=0",
  },
  timeout: 30000,
});

// Function to scrape using Puppeteer as a fallback
async function scrapeWithPuppeteer(url) {
  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
    headless: "new",
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });

    // Wait for product elements to load
    await page.waitForSelector(".a-section.octopus-pc-card-content", {
      timeout: 5000,
    });

    const items = await page.evaluate(() => {
      const products = [];
      document
        .querySelectorAll(".a-section.octopus-pc-card-content .a-list-item")
        .forEach((element) => {
          const title =
            element
              .querySelector(".octopus-pc-asin-title")
              ?.textContent?.trim() || "";
          const price =
            element
              .querySelector(".a-price .a-offscreen")
              ?.textContent?.trim() || "";
          const imageURL = element.querySelector("img")?.src || "";
          products.push({ title, price, imageURL });
        });
      return products;
    });

    return items;
  } finally {
    await browser.close();
  }
}

app.get("/", async (req, res) => {
  const amazonURL =
    "https://www.amazon.in/gp/browse.html?node=4092115031&ref_=nav_em_sbc_tvelec_gaming_consoles_0_2_9_12";

  try {
    let items = [];

    // Try axios first
    try {
      const { data } = await axiosInstance.get(amazonURL);
      const $ = cheerio.load(data);

      $(".a-section.octopus-pc-card-content .a-list-item").each(
        (index, element) => {
          const title = $(element).find(".octopus-pc-asin-title").text().trim();
          const price = $(element).find(".a-price .a-offscreen").text().trim();
          const imageURL = $(element).find("img").attr("src");
          items.push({ title, price, imageURL });
        }
      );
    } catch (axiosError) {
      console.log(
        "Axios scraping failed, trying Puppeteer...",
        axiosError.message
      );
      items = await scrapeWithPuppeteer(amazonURL);
    }

    if (items.length === 0) {
      throw new Error("No products found");
    }

    // Add timestamp to verify data freshness
    const timestamp = new Date().toISOString();
    console.log(`Scraped ${items.length} items at ${timestamp}`);

    res.render("index", { data: items });
  } catch (error) {
    console.error("Error scraping the website:", error);
    res.status(500).render("index", {
      data: [],
      error: "Unable to fetch products at this time. Please try again later.",
    });
  }
});

app.listen(port, () => {
  console.log(`App listening at port ${port}`);
});
