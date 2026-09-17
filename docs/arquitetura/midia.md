# Vídeo e imagem do MDVR — decisão em aberto

Registrado aqui porque a decisão foi adiada de propósito, e decisão adiada sem
registro vira decisão esquecida.

## O que está em jogo

Evidência de MDVR é o dado mais pesado do produto: clipe de alarme, captura de
câmera, playback. A parede de câmeras e o mosaico pedem vários fluxos ao mesmo
tempo.

## Os dois caminhos

**Object storage com URL assinada.** O serviço de mídia registra o metadado e
emite credencial temporária; o byte vai do storage direto ao navegador. O
gateway não vê o tráfego pesado. Custa um pouco mais de cuidado na expiração e
no escopo da URL.

**Proxy pela API.** Todo byte passa pelo backend. Controle de acesso mais
simples de auditar, e a revogação é imediata. Em compensação o gateway vira
gargalo exatamente quando mais gente está olhando.

## O que já está pronto para as duas

O MinIO sobe em `infra/compose.yaml` desde já, porque os dois caminhos precisam
dele. A interface do repositório de mídia deve ser escrita antes da escolha, com
as duas implementações possíveis por trás — do mesmo jeito que `RepositorioCercas`
tem HTTP e memória.

## Para decidir

Quantos fluxos simultâneos a central abre num pico, e se a revogação de acesso a
uma evidência precisa ser imediata ou pode esperar a URL expirar.
