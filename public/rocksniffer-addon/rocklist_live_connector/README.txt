RockList.Live Connector for RockSniffer

What this addon does
- Watches RockSniffer for song starts.
- Sends the current song to RockList.Live.
- Asks RockList.Live to set the matching queued song as current.

How to install it
1. Copy the rocklist_live_connector folder into RockSniffer's addons folder.
2. Start RockSniffer.
3. Open this page in your browser:
   http://127.0.0.1:9938/addons/rocklist_live_connector/rocklist_live_connector.html
4. Paste the relay URL from RockList.Live and save it.
5. Keep the page open in a browser tab or OBS browser source while you play.

What to expect
- The first release only sets the current song.
- It does not automatically mark songs as played.
- If more than one queued song matches, RockList.Live leaves the queue unchanged.
