import type { ModuleId } from '../../config/modules'

const paths: Record<ModuleId, string> = {
  wallet: 'M4 7V5h14v4M4 7h16v13H4V7Zm12 7h4m-4 0v3h4',
  faucet: 'M12 3C10 6 5 11 5 15a7 7 0 0 0 14 0c0-4-5-9-7-12Zm-3 12a3 3 0 0 0 3 3',
  token: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 5h4a2 2 0 0 1 0 4H9m0 0h5a2 2 0 0 1 0 4H9m1-9v10',
  exchange: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',
  liquidity: 'M4 5h16v14H4V5Zm0 9c3-4 5 4 8 0s5 4 8 0M8 5v4m8-4v4',
  portfolio: 'M12 3v9h9A9 9 0 0 0 12 3Zm-4 1a9 9 0 1 0 12 12H8V4Z',
}

export function ModuleIcon({ id }: { id: ModuleId }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[id]} />
    </svg>
  )
}
