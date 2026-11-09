{
  description = "Twofold development environment";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { nixpkgs, ... }: {
    devShells = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pnpm = pkgs.stdenv.mkDerivation {
          pname = "pnpm";
          version = "12.15.0";
          src = pkgs.fetchurl (if system == "x86_64-linux" then {
            url = "https://registry.npmjs.org/@pnpm/exe.linux-x64/-/exe.linux-x64-12.15.0.tgz";
            hash = "sha256-QC9wRbHgWHrLFULxjTivvMtrq/PHRROU5vs9nwFgxso=";
          } else {
            url = "https://registry.npmjs.org/@pnpm/exe.linux-arm64/-/exe.linux-arm64-12.15.0.tgz";
            hash = "sha256-gRfWXyjmJ+lJ1fxl1jNCJmMmgmpW+jdDF78T/hFmpQ4=";
          });
          nativeBuildInputs = [ pkgs.autoPatchelfHook ];
          buildInputs = [ pkgs.stdenv.cc.cc.lib ];
          installPhase = "mkdir -p $out/bin; install -m755 pnpm $out/bin/pnpm";
        };
      in {
        default = pkgs.mkShell {
          packages = [ pkgs.git pkgs.nodejs_24 pnpm ];
        };
      });
  };
}
