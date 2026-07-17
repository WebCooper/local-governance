'use client';
import axios from 'axios';
import { ethers } from 'ethers';
import { useCitizen } from '@/context/CitizenContext';
import toast from 'react-hot-toast';

interface PollProps {
    pollId: number;
    title: string;
    description: string;
    options: string[];
}

export default function PollCard({ pollId, title, description, options }: PollProps) {
    const { wallet, consumeTicket, availableTicketsCount } = useCitizen();

    const handleVote = async (optionIndex: number) => {
        if (!wallet) {
            toast.error("Please log in with your Citizen credentials first.");
            return;
        }
        if (availableTicketsCount === 0) {
            toast.error("You have run out of ZKP action tickets! Please request more.");
            return;
        }

        const votePromise = async () => {
            const activeTicket = consumeTicket();
            if (!activeTicket) throw new Error("Ticket acquisition error");

            const ethersWallet = new ethers.Wallet(wallet.privateKey);
            const timestamp = Date.now();

            // 1. Generate challenge for CitizenAuthGuard validation
            const authChallenge = `get-pseudonym:${wallet.publicKey}:${timestamp}`;
            const authSignature = await ethersWallet.signMessage(authChallenge);

            // 2. Generate citizen's signature over the vote payload itself
            const voteMessageHash = ethers.solidityPackedKeccak256(
                ["uint256", "uint256", "string"],
                [pollId, optionIndex, activeTicket.ticketId]
            );
            const voteSignature = await ethersWallet.signMessage(ethers.getBytes(voteMessageHash));

            // Post secure payload to NestJS backend relayer (port 3001)
            const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || "http://localhost:3001";
            const response = await axios.post(`${RELAYER_URL}/polling/vote`, {
                pollId,
                optionIndex,
                zkpTicketId: activeTicket.ticketId,
                zkpSignature: activeTicket.signature,
                citizenPubKey: wallet.publicKey,
                signature: voteSignature
            }, {
                headers: {
                    Authorization: `${wallet.publicKey}:${timestamp}:${authSignature}`
                }
            });

            if (!response.data.success) {
                throw new Error("Vote registration failed");
            }
            return response.data;
        };

        toast.promise(votePromise(), {
            loading: 'Registering your vote anonymously...',
            success: 'Vote registered successfully without exposing wallet address!',
            error: (err: any) => `Voting rejected: ${err.response?.data?.message || err.message}`
        });
    };

    return (
        <div className="border p-6 rounded-lg bg-gray-900 text-white space-y-4 w-full max-w-md mx-auto">
            <h3 className="text-xl font-bold border-b border-gray-800 pb-2 text-green-400">{title}</h3>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{description}</p>
            <div className="flex flex-col space-y-2 pt-2">
                {options.map((opt, idx) => (
                    <button key={idx} onClick={() => handleVote(idx)} className="bg-gray-800 hover:bg-green-600 hover:text-black p-3 rounded font-medium text-left transition-all duration-200">
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
}