import { useState, useEffect } from "react";
import { ethers } from "ethers";

const FLOW_TESTNET_PARAMS = {
  chainId: "0x221", // 545
  chainName: "Flow Testnet",
  nativeCurrency: { name: "FLOW", symbol: "FLOW", decimals: 18 },
  rpcUrls: ["https://testnet.evm.nodes.onflow.org"],
  blockExplorerUrls: ["https://evm-testnet.flowscan.io/"],
};

export function useWeb3() {
  const [account, setAccount] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);

  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") {
      alert("Please install MetaMask!");
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const currentSigner = await provider.getSigner();
      
      setAccount(accounts[0]);
      setSigner(currentSigner);
      checkNetwork(provider);
    } catch (error) {
      console.error("Connection error:", error);
    }
  };

  const checkNetwork = async (provider: ethers.BrowserProvider) => {
    const network = await provider.getNetwork();
    if (Number(network.chainId) === 545) {
      setIsCorrectNetwork(true);
    } else {
      setIsCorrectNetwork(false);
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: FLOW_TESTNET_PARAMS.chainId }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [FLOW_TESTNET_PARAMS],
          });
        }
      }
    }
  };

  useEffect(() => {
    const autoConnect = async () => {
      if (typeof window.ethereum !== "undefined") {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await provider.listAccounts();
          
          if (accounts.length > 0) {
            const currentSigner = await provider.getSigner();
            setAccount(accounts[0].address);
            setSigner(currentSigner);
            checkNetwork(provider);
          }
        } catch (error) {
          console.error("Auto-connect error:", error);
        }
      }
    };

    autoConnect();

    if (typeof window.ethereum !== "undefined") {
      const handleAccountsChanged = async (accounts: string[]) => {
        if (accounts.length > 0) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const currentSigner = await provider.getSigner();
          setAccount(accounts[0]);
          setSigner(currentSigner);
        } else {
          setAccount(null);
          setSigner(null);
        }
      };

      const handleChainChanged = () => {
        window.location.reload();
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, []);

  return { account, signer, isCorrectNetwork, connectWallet };
}
