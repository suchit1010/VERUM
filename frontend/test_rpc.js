const { Connection, PublicKey } = require('@solana/web3.js');
async function test() {
  const conn = new Connection('https://devnet.helius-rpc.com/?api-key=d18f4a13-2d1b-4b13-88d4-539077259163');
  try {
    const info = await conn.getAccountInfo(new PublicKey('HJ6TUXQ34XhDrmvcozMsBWhSuEVkEcYeqoTWo1Bcmzet'));
    console.log('Success! Connected.');
  } catch (err) {
    console.log('Fetch error:', err);
  }
}
test();
