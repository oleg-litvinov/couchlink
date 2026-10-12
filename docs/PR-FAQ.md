# PRESS RELEASE

**CouchLink lets families who live apart watch movies together on Fire TV, in perfect sync**
*Start a watch party with a 6-digit code, let Alexa find something everyone wants, and ask questions mid-show without spoilers.*

SEATTLE, October 2026. Today we announced CouchLink, a watch-together experience for Fire TV. It helps long-distance couples, grandparents and grandkids, and friends in different cities share movie night from their own couches. Nobody needs to count down "3, 2, 1, press play" over the phone.

**The problem.** Millions of people watch "together" while apart by texting countdowns and asking "wait, where are you?" Fire OS and Vega OS have no built-in watch-together feature. The existing options work only in browsers or on phones, or have been shut down. Picking *what* to watch is its own negotiation, and asking "who is that?" means someone pauses and searches on a phone.

**The solution.** One person starts a party on their Fire TV and reads out a code. The other enters it on theirs, or just tells Alexa. Each person says what they're in the mood for. CouchLink suggests titles that suit both, they vote with the remote, and the movie starts on both TVs at the same moment. Anyone can pause for everyone. Ask Alexa "who is that?" and both TVs pause and show the same answer, and it never gives away what happens next.

**Quote from us.** "We built CouchLink for the nights when you'd give anything to be on the same couch. The technology should disappear, so it just feels like watching together." (The CouchLink team)

**How it works.**
1. Press **Start a watch party** and share the code.
2. Tell Alexa your mood ("something funny, under 90 minutes"), then vote on the shared picks.
3. Watch in sync. Pause, seek or ask questions, and everyone stays together.

**Customer quote.** "My mom and I used to FaceTime while pressing play at the same time and we were always 10 seconds apart. Now we just say 'Alexa, pause' and it pauses for both of us." (Priya, illustrative persona: replace with a real user quote after testing)

**Get started.** Open CouchLink on Fire TV, or try the web build at the link in our submission.

---

# FAQ

## External (customer) FAQ

1. **Who is this for?** Anyone watching together from different homes: long-distance couples, families across cities, and friend groups.
2. **How much does it cost?** CouchLink is free. It's designed as a feature any streaming app can adopt.
3. **How is my data used?** We store only the session code, display names, moods and votes, and they expire automatically after 24 hours. Nothing is used to train models.
4. **What if the AI gets it wrong?**
   - Picks always come from the real catalog, and you vote before anything plays.
   - Answers are labeled as AI. They're limited to what has already happened on screen, and say "not sure yet" when the context doesn't contain the answer.
5. **How is this different from Teleparty or Prime Video Watch Party?** Those depend on a browser or phone. CouchLink lives on the TV itself, uses the remote and Alexa, and adds joint discovery and Q&A.

## Internal (stakeholder / judge) FAQ

1. **Why now?** Several things just became available together:
   - Vega OS and its React Native toolchain make modern TV apps fast to build.
   - Low-cost models like Amazon Nova make per-session AI cost negligible.
   - Alexa can act as a voice remote across devices.
2. **How big is the opportunity?** Families and couples living apart number in the tens of millions in the US alone. Watching together is a weekly habit for many of them, so the pain comes up every week.
3. **Which Amazon services, and why?**

   | Service | What it does for CouchLink |
   |---|---|
   | API Gateway WebSocket | Real-time fan-out to every TV |
   | Lambda | Serverless session logic that scales to zero |
   | DynamoDB | Session state, with a TTL for privacy |
   | Bedrock (Nova 2 Lite) + Guardrails | Joint picks and spoiler-safe Q&A |
   | Alexa Skills Kit | The voice remote |
   | S3 + CloudFront | Web app and media delivery |
   | CloudWatch | Dashboard and AI latency metrics |

4. **What does it cost to run?** Well under $0.01 of compute and AI per 2-hour session (Lambda, DynamoDB and API Gateway on demand, plus about 4 Nova Lite calls). Video delivery is the only material cost, and a streaming partner already pays for it.
5. **Biggest risks?**
   - Sync drift. Mitigated by server time plus drift correction, and we measure it.
   - Content licensing. Mitigated by pitching CouchLink as an SDK or platform API.
   - Voice routing from Alexa to a TV app. Mitigated by routing through our backend, with an on-screen fallback.
6. **What did we deliberately leave out?** Accounts and login, more than 2–3 viewers, a phone remote, and control of third-party apps like Netflix (technically impossible today).
7. **How will we measure success?**

   | Metric | Target |
   |---|---|
   | Median sync drift | < 300 ms |
   | Time from app open to watching together | < 60 s |
   | Sessions with at least one voice action | > 50% |

8. **Tenets.**
   - The couch comes first and the tech disappears.
   - Every TV shows who did what.
   - A human chooses before anything plays.
   - No spoilers, ever: enforced in code, not prompts.
9. **What's next?**
   - Emoji reactions.
   - "Catch me up" for late joiners.
   - An MCP server for Alexa+.
   - Offering watch-together as a Fire TV platform API for any streaming app.
