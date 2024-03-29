import * as SplToken from "@solana/spl-token";
import * as Web3 from '@solana/web3.js';
import Utils from "./utils";

class Token {

    web3;

    tokenAddress;

    constructor(web3) {
        this.web3 = web3;
    }

    setTokenAddress(tokenAddress) {
        this.tokenAddress = tokenAddress;
    }

    async create(decimals) {
        const publicKey = this.web3.getConnectedPublicKey();
        const mintAccount = Web3.Keypair.generate();
        
        const balanceNeeded = await SplToken.Token.getMinBalanceRentForExemptMint(this.web3.connection);

        const transaction = this.web3.createTransaction(
            Web3.SystemProgram.createAccount({
                fromPubkey: publicKey,
                newAccountPubkey: mintAccount.publicKey,
                lamports: balanceNeeded,
                space: SplToken.MintLayout.span,
                programId: this.getProgramId()
            })
        );

        transaction.add(
            SplToken.Token.createInitMintInstruction(
                this.getProgramId(),
                mintAccount.publicKey,
                decimals, 
                publicKey,
                publicKey
            )
        );
        
        let signature = await this.web3.sendTransaction(transaction, {signers: [mintAccount]});
        
        return {tokenAddress: mintAccount.publicKey.toString(), signature};
    }

    async createAccount(tokenAddress) {
        const token = this.instance(tokenAddress);
        const publicKey = this.web3.getConnectedPublicKey();
        const newAcount = Web3.Keypair.generate();
        
        const balanceNeeded = await SplToken.Token.getMinBalanceRentForExemptAccount(this.web3.connection);

        const transaction = this.web3.createTransaction(
            Web3.SystemProgram.createAccount({
                fromPubkey: publicKey,
                newAccountPubkey: newAcount.publicKey,
                lamports: balanceNeeded,
                space: SplToken.AccountLayout.span,
                programId: this.getProgramId()
            })
        );

        transaction.add(
            SplToken.Token.createInitAccountInstruction(
                this.getProgramId(),
                token.publicKey,
                newAcount.publicKey,
                publicKey
            )
        );
        
        let signature = await this.web3.sendTransaction(transaction, {signers: [newAcount]});
        
        return {tokenAccountAddress: newAcount.publicKey.toString(), signature};

    }

    async mintTo(tokenAddress, tokenAccount, amount) {
        tokenAddress = this.tokenAddress || tokenAddress;
        tokenAccount = new Web3.PublicKey(tokenAccount);
        const token = this.instance(tokenAddress);
        const mintInfo = await token.getMintInfo(tokenAddress);
        const publicKey = this.web3.getConnectedPublicKey();

        const transaction = this.web3.createTransaction(
            SplToken.Token.createMintToInstruction(
                this.getProgramId(),
                token.publicKey,
                tokenAccount, 
                publicKey,
                [],
                Utils.toHexadecimal(amount, mintInfo.decimals)
            )
        );

        return await this.web3.sendTransaction(transaction);
    }

    getProgramId() {
        return SplToken.TOKEN_PROGRAM_ID;
    }

    instance(tokenAddress) {
        return new SplToken.Token(
            this.web3.connection,
            (new Web3.PublicKey(this.tokenAddress || tokenAddress)),
            this.getProgramId()
        );
    }

    transfer(toAddress, amount, tokenAddress) {
        tokenAddress = this.tokenAddress || tokenAddress;
        return new Promise(async (resolve, reject) => {
            try {
                
                if (parseFloat(amount) < 0) {
                    return reject('transfer-amount-error');
                }

                if (parseFloat(amount) > await this.getBalance(tokenAddress)) {
                    return reject('insufficient-balance');
                }

                const programId = this.getProgramId();
                const fromPublicKey = this.web3.getConnectedPublicKey();
                const toPublicKey = new Web3.PublicKey(toAddress);
                const tokenInfo = await this.getInfo(tokenAddress);
                amount = Utils.toHexadecimal(amount, tokenInfo.decimals);
    
                const token = this.instance(tokenAddress);
    
                const fromTokenAccount = await token.getOrCreateAssociatedAccountInfo(fromPublicKey);
    
                const toTokenAccount = await token.getOrCreateAssociatedAccountInfo(toPublicKey);
    
                const transaction = this.web3.createTransaction(
                    SplToken.Token.createTransferInstruction(
                        programId,
                        fromTokenAccount.address,
                        toTokenAccount.address, 
                        fromPublicKey,
                        [],
                        amount
                    )
                );
    
                const signature = await this.web3.sendTransaction(transaction);
    
                return resolve(signature);
            } catch (error) {
                return reject(error);
            }
        });
    }

    async getBalance(tokenAddress) {
        let tokenInfo = await this.getInfo(this.tokenAddress || tokenAddress);
        return tokenInfo.uiAmount;
    }

    async getInfo(tokenAddress) {
        tokenAddress = this.tokenAddress || tokenAddress;
        const tokenPublicKey = new Web3.PublicKey(tokenAddress);

        let tokenAccounts = await this.web3.connection.getTokenAccountsByOwner(
            this.web3.getConnectedPublicKey(), 
            {
                mint: tokenPublicKey
            }
        );

        let tokenAccount = tokenAccounts.value[0].pubkey;

        let tokenInfo = await this.web3.connection.getTokenAccountBalance(tokenAccount);

        return Object.assign(tokenInfo.value, {tokenAccount: tokenAccount.toBase58(), tokenAddress});
    }

    async getAccountInfo(tokenAccount, tokenAddress) {
        const token = this.instance(tokenAddress);
        return await token.getAccountInfo((new Web3.PublicKey(tokenAccount)));
    }
}

module.exports = Token;