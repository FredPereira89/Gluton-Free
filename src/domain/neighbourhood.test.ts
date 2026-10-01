import { describe, expect, it } from "vitest";
import { NEIGHBOURHOOD_FALLBACK, neighbourhoodOf } from "./neighbourhood";

const at = (lat: number, lng: number, extra: { area?: string | null; address?: string | null } = {}) =>
  neighbourhoodOf({ area: null, address: null, lat, lng, ...extra });

describe("neighbourhood of a Restaurant", () => {
  it("keeps the stored area when there is one", () => {
    expect(at(38.7075, -9.1364, { area: "Alfama" })).toBe("Alfama");
  });

  it("takes the neighbourhood the address itself names, between commas", () => {
    expect(at(38.7075, -9.1364, { address: "R. da Barroca 54 56, Bairro Alto, 1200-050 Lisboa, Portugal" })).toBe("Bairro Alto");
    expect(at(38.7075, -9.1364, { address: "Rua do Carmo, 2, Armazéns do Chiado, loja 6.02, Chiado, 1200-094 Lisboa" })).toBe("Chiado");
  });

  it("does not mistake a street name for a neighbourhood", () => {
    expect(at(38.7075, -9.1364, { address: "Rua da Graça 12, 1170-139 Lisboa" })).toBe("Baixa");
  });

  it.each([
    ["Praça do Comércio", 38.7075, -9.1364, "Baixa"],
    ["Miradouro das Portas do Sol", 38.712, -9.1305, "Alfama"],
    ["Time Out Market", 38.7068, -9.1458, "Cais do Sodré"],
    ["Jardim do Príncipe Real", 38.7166, -9.1493, "Príncipe Real"],
    ["Jardim da Estrela", 38.7135, -9.1596, "Estrela & Lapa"],
    ["Mercado de Campo de Ourique", 38.7168, -9.1668, "Campo de Ourique"],
    ["LX Factory", 38.7035, -9.178, "Alcântara"],
    ["Torre de Belém", 38.6916, -9.216, "Belém"],
    ["Largo do Intendente", 38.7222, -9.1353, "Anjos & Intendente"],
    ["Estádio da Luz", 38.7527, -9.1847, "Benfica"],
    ["Oceanário", 38.7633, -9.0935, "Parque das Nações"],
  ])("places %s from its coordinates", (_place, lat, lng, expected) => {
    expect(at(lat, lng)).toBe(expected);
  });

  it("files a point far from every neighbourhood under a documented fallback", () => {
    expect(at(38.9, -9.4)).toBe(NEIGHBOURHOOD_FALLBACK);
    expect(NEIGHBOURHOOD_FALLBACK).toBe("Elsewhere in Lisbon");
  });

  it("files a Restaurant with no coordinates and no area under the fallback", () => {
    expect(neighbourhoodOf({ area: null, address: null, lat: null, lng: null })).toBe(NEIGHBOURHOOD_FALLBACK);
  });
});
