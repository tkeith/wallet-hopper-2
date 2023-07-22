import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { ToastContainer, toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { mainnet, polygon } from 'viem/chains'
import { walletHopperABI, walletHopperAddress } from 'abis'
import * as chains from 'viem/chains'

const CHAINS: Record<number, chains.Chain> = {
  [137]: chains.polygon,
}

type AsyncFunction<TArgs extends any[], TResult> = (...args: TArgs) => Promise<TResult>

function memoizeAsync<TArgs extends any[], TResult>(fn: AsyncFunction<TArgs, TResult>): AsyncFunction<TArgs, TResult> {
  const cache = new Map<string, Promise<TResult>>()

  return async (...args: TArgs): Promise<TResult> => {
    const key = JSON.stringify(args)

    if (cache.has(key)) {
      return (await cache.get(key))!
    }

    const resultPromise = fn(...args)
    cache.set(key, resultPromise)
    return await resultPromise
  }
}

const RecipientPreferences: React.FC = () => {
  const [jsonInput, setJsonInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const getChainDetails = memoizeAsync(async function () {
    const walletClient = createWalletClient({
      transport: custom((window as any).ethereum),
    })

    const chainId = await walletClient.getChainId()

    const chain = CHAINS[chainId]

    const publicClient = createPublicClient({
      chain: chain,
      transport: http(),
    })

    const contractAddress = (walletHopperAddress as Record<number, `0x${string}`>)[chainId]
    if (!contractAddress) {
      toast.error('Contract not deployed on this network')
    }

    const [address] = await walletClient.getAddresses()

    return { walletClient, chainId, chain, publicClient, contractAddress, address }
  })

  useEffect(() => {
    ;(async function () {
      const { walletClient, chainId, chain, publicClient, contractAddress, address } = await getChainDetails()
      const response = await axios.get('/api/wallet-meta', {
        params: {
          blockchain: chain.name.toLowerCase(),
          tokenAddress: contractAddress,
          userAddress: address,
        },
      })
      if (response.data && (JSON.parse(response.data.data) as any).timestamp) {
        const jsonData = JSON.parse(response.data.data)
        jsonData.timestamp = new Date().toISOString()
        setJsonInput(JSON.stringify(jsonData, null, 2))
      } else {
        setJsonInput(
          JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              primaryAddress: address,
              primaryChain: chain.name.toLowerCase(),
              preferredAssets: [{ chain: 'ethereum', address: address, symbol: 'ETH' }],
              addresses: [address],
              attestations: {},
            },
            null,
            2
          )
        )
      }
    })()
  }, [])

  const getData = () => {
    try {
      return JSON.parse(jsonInput)
    } catch (error) {
      toast.error('Invalid JSON')
      return null
    }
  }

  async function updateOnChainPointer(cid: string) {
    const { walletClient, chainId, chain, publicClient, contractAddress, address } = await getChainDetails()
    const txnHash = await walletClient.writeContract({
      account: address,
      address: contractAddress,
      abi: walletHopperABI,
      chain: chain,
      functionName: 'setPointer',
      args: ['ipfs:' + cid],
    })
    toast.info(`Generated transaction, waiting for success...`)
    await publicClient.waitForTransactionReceipt({ hash: txnHash })
    return { txnHash }
  }

  const saveData = async (data: any) => {
    const { chain } = await getChainDetails()
    try {
      setIsLoading(true)
      const response = await axios.post('/api/store', { data: JSON.stringify(data, null, 2) })
      toast.info(`Successfully stored to IPFS: ${response.data.cid}`)
      const res = await updateOnChainPointer(response.data.cid)
      if (!res) {
        toast.error('Error putting pointer on chain')
      } else {
        const { txnHash } = res
        toast.success(
          <>
            <a target="_blank" href={chain.blockExplorers!.default.url + '/tx/' + txnHash}>
              Successfully updated on-chain pointer. Txn: {txnHash}
            </a>
          </>
        )
      }
    } catch (error) {
      toast.error('Error storing data')
      console.log(error)
      console.log((error as any).stack)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = () => {
    const data = getData()
    if (data !== null) {
      saveData(data)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Configure Recipient Preferences</h1>
      <textarea className="w-full h-64 p-2 border rounded mb-4" value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} />
      <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={handleSave} disabled={isLoading}>
        {isLoading ? 'Saving...' : 'Save preferences'}
      </button>
      <ToastContainer
        position="bottom-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  )
}

export default RecipientPreferences