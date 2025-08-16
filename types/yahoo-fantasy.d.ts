// Minimal module declaration so TypeScript/Vercel build doesn't error.
declare module 'yahoo-fantasy' {
	export default class YahooFantasy {
		constructor(consumerKey: string, consumerSecret: string);
		setUserToken(token: string): void;
		league: any;
		team: any;
		player: any;
		user: any;
	}
}
